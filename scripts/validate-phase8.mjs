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
  console.log("Phase 8 validation against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase, "render:", health.renderEnabled);
  if (health.phase < 8 || !health.renderEnabled) {
    throw new Error("API is not reporting Phase 8 render");
  }

  const email = `phase8_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase8 Tester" }),
  });
  const token = registered.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  const projectRes = await req("/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Phase8 Master Cut",
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

  await advanceUntil(token, projectId, "audio");

  const started = await req(`/projects/${projectId}/render/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({ includeTitles: true, burnSubtitles: true }),
  });
  await waitForJob(token, projectId, "VIDEO_RENDERING", 420000, started.job.id);

  const status = await req(`/projects/${projectId}/render/status`, { headers });
  if (!status.latest || status.latest.status !== "SUCCEEDED" || !status.latest.outputAssetId) {
    throw new Error("Expected succeeded render with output asset");
  }

  const assetRes = await fetch(`${API}/assets/${status.latest.outputAssetId}/content`, {
    headers,
  });
  if (!assetRes.ok) throw new Error(`Render asset download failed: ${assetRes.status}`);
  const bytes = Buffer.from(await assetRes.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`Render output too small: ${bytes.length}`);

  const project = await req(`/projects/${projectId}`, { headers });
  if (project.project.status !== "COMPLETED") {
    throw new Error(`Expected COMPLETED project, got ${project.project.status}`);
  }
  if (project.project.progressPercent !== 100) {
    throw new Error(`Expected 100% progress, got ${project.project.progressPercent}`);
  }

  console.log(
    "render:",
    status.latest.status,
    "bytes:",
    bytes.length,
    "asset:",
    status.latest.outputAssetId,
  );
  console.log("PHASE8_OK");
}

main().catch((error) => {
  console.error("PHASE8_FAIL", error.message);
  process.exit(1);
});
