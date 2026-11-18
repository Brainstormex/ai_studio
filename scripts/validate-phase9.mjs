const API = process.env.API_URL ?? "http://127.0.0.1:4000";

async function req(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> ${res.status}: ${data?.error ?? text}`);
  }
  return data;
}

async function waitForJob(token, projectId, type, timeoutMs = 300000, jobId = null) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { jobs } = await req(`/projects/${projectId}/generation/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const job = jobId
      ? jobs.find((item) => item.id === jobId)
      : jobs.find((item) => item.type === type);
    if (job?.status === "SUCCEEDED") return job;
    if (job?.status === "FAILED") {
      throw new Error(`${type} failed: ${job.errorMessage ?? "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

async function advanceUntil(token, projectId, stageId, timeoutMs = 420000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await req(`/projects/${projectId}/orchestration/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stage = status.stages.find((item) => item.id === stageId);
    if (stage?.complete) return status;
    if (status.projectStatus === "FAILED" || status.projectStatus === "CANCELLED") {
      throw new Error(`Project ${status.projectStatus} while advancing to ${stageId}`);
    }
    if (status.activeJobs.length === 0) {
      await req(`/projects/${projectId}/orchestration/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ through: stageId }),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out advancing to ${stageId}`);
}

async function main() {
  console.log("Phase 9 validation against", API);
  const health = await req("/health");
  console.log(
    "health phase:",
    health.phase,
    "timeline:",
    health.timelineEnabled,
    "costs:",
    health.costsEnabled,
    "continue:",
    health.continueEpisodeEnabled,
  );
  if (
    health.phase < 9 ||
    !health.timelineEnabled ||
    !health.costsEnabled ||
    !health.continueEpisodeEnabled
  ) {
    throw new Error("API is not reporting Phase 9 timeline/cost/continue features");
  }

  const email = `phase9_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase9 Tester" }),
  });
  const token = registered.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  const projectRes = await req("/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Phase9 Continuity Cut",
      mode: "TOPIC_TO_VIDEO",
      topic: "A lighthouse keeper winds the lamp before a storm.",
      targetDurationSeconds: 90,
      storyLanguage: "en",
      dialogueLanguage: "en",
      narrationLanguage: "en",
      voiceLanguage: "en",
      subtitleLanguage: "en",
      visualStyle: "CINEMATIC",
      resolution: "P720",
      aspectRatio: "LANDSCAPE_16_9",
      videoProvider: "google-omni",
    }),
  });
  const projectId = projectRes.project.id;
  console.log("project:", projectId);

  await advanceUntil(token, projectId, "storyboard");

  const beforeScreenplay = await req(`/projects/${projectId}/generation/screenplay`, { headers });
  const beforeCharacters = beforeScreenplay.characters.length;
  const beforeEpisodeIds = beforeScreenplay.episodes.map((episode) => episode.id);
  if (beforeEpisodeIds.length < 1) {
    throw new Error("Expected at least one episode before continue");
  }

  const timelineBefore = await req(`/projects/${projectId}/timeline`, { headers });
  if (!timelineBefore.totalShots || timelineBefore.totalShots < 1) {
    throw new Error("Timeline should include storyboard shots");
  }
  console.log(
    "timeline before:",
    timelineBefore.totalShots,
    "shots,",
    timelineBefore.totalSeconds,
    "s",
  );

  const costsBefore = await req(`/projects/${projectId}/costs`, { headers });
  if (!Array.isArray(costsBefore.byProvider) || !Array.isArray(costsBefore.byOperation)) {
    throw new Error("Costs response missing provider/operation breakdown");
  }
  console.log(
    "costs before:",
    costsBefore.totals.actualUsd,
    "usd,",
    costsBefore.totals.recordCount,
    "records",
  );

  const continueRes = await req(`/projects/${projectId}/episodes/continue`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      additionalSeconds: 60,
      instruction: "The storm arrives and the keeper must choose who to save.",
    }),
  });
  await waitForJob(token, projectId, "EPISODE_CONTINUATION", 180000, continueRes.job.id);
  console.log("continue job succeeded");

  await waitForJob(token, projectId, "STORYBOARD_GENERATION", 180000);

  const afterScreenplay = await req(`/projects/${projectId}/generation/screenplay`, { headers });
  if (afterScreenplay.episodes.length < beforeEpisodeIds.length + 1) {
    throw new Error(
      `Expected episode append, got ${afterScreenplay.episodes.length} after ${beforeEpisodeIds.length}`,
    );
  }
  for (const id of beforeEpisodeIds) {
    if (!afterScreenplay.episodes.some((episode) => episode.id === id)) {
      throw new Error("Continue wiped a prior episode");
    }
  }
  if (afterScreenplay.characters.length < beforeCharacters) {
    throw new Error("Continue reduced character count");
  }

  const timelineAfter = await req(`/projects/${projectId}/timeline`, { headers });
  if (timelineAfter.totalShots <= timelineBefore.totalShots) {
    throw new Error("Timeline should grow after continuation storyboard");
  }
  if (!timelineAfter.episodes.some((episode) => episode.number >= 2)) {
    throw new Error("Timeline missing episode 2+");
  }

  const costsAfter = await req(`/projects/${projectId}/costs`, { headers });
  if (costsAfter.totals.recordCount < costsBefore.totals.recordCount) {
    throw new Error("Cost records should not shrink");
  }
  if (!costsAfter.byOperation.some((row) => row.operation === "continue_episode")) {
    throw new Error("Expected continue_episode usage/cost entry");
  }

  const project = await req(`/projects/${projectId}`, { headers });
  if (Number(project.project.targetDurationSeconds) < 150) {
    throw new Error("Project duration should increase after continue");
  }

  console.log("Phase 9 validation passed");
  console.log(
    JSON.stringify(
      {
        projectId,
        episodes: afterScreenplay.episodes.map((episode) => ({
          id: episode.id,
          number: episode.number,
          title: episode.title,
        })),
        timelineShots: timelineAfter.totalShots,
        timelineSeconds: timelineAfter.totalSeconds,
        costActualUsd: costsAfter.totals.actualUsd,
        byProvider: costsAfter.byProvider,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
