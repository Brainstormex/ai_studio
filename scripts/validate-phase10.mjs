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
    const error = new Error(
      `${options.method ?? "GET"} ${path} -> ${res.status}: ${data?.error ?? text}`,
    );
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function waitForJob(token, projectId, type, timeoutMs = 420000, jobId = null) {
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

async function advanceUntil(token, projectId, stageId, timeoutMs = 480000) {
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
  console.log("Phase 10 E2E acceptance against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase, "budget:", health.budgetEnforcementEnabled);
  if (health.phase < 10 || !health.budgetEnforcementEnabled || !health.e2eReady) {
    throw new Error("API is not reporting Phase 10 readiness");
  }
  if (!health.providerModes) {
    throw new Error("Health missing providerModes resolution");
  }

  const email = `phase10_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase10 Tester" }),
  });
  const token = registered.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  try {
    await req("/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Budget Reject",
        mode: "TOPIC_TO_VIDEO",
        topic: "Too cheap budget",
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
        budgetLimitUsd: 0.5,
      }),
    });
    throw new Error("Expected create to reject undersized budget");
  } catch (error) {
    if (error.status !== 400) throw error;
    console.log("budget create reject: ok");
  }

  const projectRes = await req("/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Phase10 Acceptance Cut",
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
      budgetLimitUsd: 50,
    }),
  });
  const projectId = projectRes.project.id;
  console.log("project:", projectId);

  await advanceUntil(token, projectId, "storyboard");
  const timelineBefore = await req(`/projects/${projectId}/timeline`, { headers });
  if (timelineBefore.totalShots < 1) throw new Error("Expected storyboard shots on timeline");

  await advanceUntil(token, projectId, "audio");
  const video = await req(`/projects/${projectId}/video/status`, { headers });
  if ((video.succeeded ?? 0) < 1) throw new Error("Expected succeeded video clips");

  const audio = await req(`/projects/${projectId}/audio/status`, { headers });
  if ((audio.withAudio ?? 0) < 1) throw new Error("Expected audio-ready shots");

  const renderStart = await req(`/projects/${projectId}/render/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({ includeTitles: true, burnSubtitles: true }),
  });
  await waitForJob(token, projectId, "VIDEO_RENDERING", 420000, renderStart.job.id);
  const render = await req(`/projects/${projectId}/render/status`, { headers });
  if (!render.latest?.outputAssetId || render.latest.status !== "SUCCEEDED") {
    throw new Error("Expected succeeded master render");
  }
  const assetRes = await fetch(`${API}/assets/${render.latest.outputAssetId}/content`, {
    headers,
  });
  if (!assetRes.ok) throw new Error(`Render download failed: ${assetRes.status}`);
  const bytes = Buffer.from(await assetRes.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`Render too small: ${bytes.length}`);

  const costs = await req(`/projects/${projectId}/costs`, { headers });
  if (!costs.budget || typeof costs.budget.overBudget !== "boolean") {
    throw new Error("Costs response missing budget projection");
  }
  if (!Array.isArray(costs.byProvider) || costs.byProvider.length < 1) {
    throw new Error("Expected usage/cost provider breakdown");
  }

  const continueRes = await req(`/projects/${projectId}/episodes/continue`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      additionalSeconds: 60,
      instruction: "The storm arrives.",
    }),
  });
  await waitForJob(token, projectId, "EPISODE_CONTINUATION", 180000, continueRes.job.id);
  await waitForJob(token, projectId, "STORYBOARD_GENERATION", 180000);

  const screenplay = await req(`/projects/${projectId}/generation/screenplay`, { headers });
  if (screenplay.episodes.length < 2) throw new Error("Expected continued episode");
  const timelineAfter = await req(`/projects/${projectId}/timeline`, { headers });
  if (timelineAfter.totalShots <= timelineBefore.totalShots) {
    throw new Error("Timeline should grow after continuation");
  }

  const tight = await req("/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Tight Budget Pipeline",
      mode: "TOPIC_TO_VIDEO",
      topic: "Budget clamp story",
      targetDurationSeconds: 60,
      storyLanguage: "en",
      dialogueLanguage: "en",
      narrationLanguage: "en",
      voiceLanguage: "en",
      subtitleLanguage: "en",
      visualStyle: "CINEMATIC",
      resolution: "P720",
      aspectRatio: "LANDSCAPE_16_9",
      videoProvider: "google-omni",
      budgetLimitUsd: 5,
    }),
  });
  const tightId = tight.project.id;
  await advanceUntil(token, tightId, "storyboard");

  const costsTight = await req(`/projects/${tightId}/costs`, { headers });
  const clampBudget = Math.max(0.01, Number(costsTight.totals.actualUsd ?? 0) + 0.01);
  await req(`/projects/${tightId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ budgetLimitUsd: clampBudget }),
  });

  try {
    await req(`/projects/${tightId}/video/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({ regenerate: false }),
    });
    throw new Error("Expected video start to fail under tight budget");
  } catch (error) {
    if (error.status !== 402) throw error;
    console.log("budget video reject: ok");
  }

  const project = await req(`/projects/${projectId}`, { headers });
  console.log(
    JSON.stringify(
      {
        projectId,
        status: project.project.status,
        episodes: screenplay.episodes.length,
        timelineShots: timelineAfter.totalShots,
        renderBytes: bytes.length,
        costActualUsd: costs.totals.actualUsd,
        providerModes: health.providerModes,
      },
      null,
      2,
    ),
  );
  console.log("PHASE10_OK");
}

main().catch((error) => {
  console.error("PHASE10_FAIL", error.message);
  process.exit(1);
});
