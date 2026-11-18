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

async function waitForJob(token, projectId, type, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { jobs } = await req(`/projects/${projectId}/generation/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const job = jobs.find((item) => item.type === type);
    if (job?.status === "SUCCEEDED") return job;
    if (job?.status === "FAILED") {
      throw new Error(`${type} failed: ${job.errorMessage ?? "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

async function main() {
  console.log("Phase 5 validation against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase, "video:", health.videoGenerationEnabled);
  if (health.phase < 5 || !health.videoGenerationEnabled) {
    throw new Error("API is not reporting Phase 5 video generation");
  }

  const email = `phase5_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase5 Tester" }),
  });
  const token = registered.accessToken;

  const projectRes = await req("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Phase5 Omni Clips",
      mode: "TOPIC_TO_VIDEO",
      topic: "A paper lantern drifts across a midnight lake while a child listens.",
      targetDurationSeconds: 120,
      storyLanguage: "en",
      dialogueLanguage: "en",
      narrationLanguage: "en",
      voiceLanguage: "en",
      subtitleLanguage: "en",
      visualStyle: "ANIMATION_2D",
      resolution: "P720",
      aspectRatio: "LANDSCAPE_16_9",
      videoProvider: "google-omni",
    }),
  });
  const projectId = projectRes.project.id;

  await req(`/projects/${projectId}/generation/story`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ regenerate: false }),
  });

  await waitForJob(token, projectId, "STORY_GENERATION");
  await waitForJob(token, projectId, "CHARACTER_GENERATION");
  await waitForJob(token, projectId, "ENVIRONMENT_GENERATION");
  await waitForJob(token, projectId, "STORYBOARD_GENERATION");

  const board = await req(`/projects/${projectId}/storyboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!board.shotCount) throw new Error("Expected storyboard shots before video");

  await req(`/projects/${projectId}/video/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ regenerate: false }),
  });

  await waitForJob(token, projectId, "VIDEO_GENERATION", 300000);

  const status = await req(`/projects/${projectId}/video/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!status.succeeded || status.succeeded < 1) {
    throw new Error(`Expected succeeded clips, got ${status.succeeded}`);
  }

  const withAsset = status.shots.find((shot) => shot.segment?.assetId);
  if (!withAsset?.segment?.assetId) {
    throw new Error("Expected a video segment with an asset");
  }

  const assetRes = await fetch(`${API}/assets/${withAsset.segment.assetId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!assetRes.ok) {
    throw new Error(`Asset content failed: ${assetRes.status}`);
  }
  const bytes = Buffer.from(await assetRes.arrayBuffer());
  if (bytes.length < 20) {
    throw new Error("Video asset too small");
  }

  const retryShotId = status.shots[0].shotId;
  await req(`/projects/${projectId}/video/shots/${retryShotId}/retry`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ regenerate: true }),
  });
  await waitForJob(token, projectId, "VIDEO_EXTENSION");

  const project = await req(`/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (Number(project.project.actualCostUsd) <= 0) {
    throw new Error("Expected video cost to be recorded");
  }

  console.log(
    "clips:",
    status.succeeded,
    "/",
    status.total,
    "seconds:",
    status.generatedSeconds,
    "cost:",
    project.project.actualCostUsd,
  );
  console.log("PHASE5_OK");
}

main().catch((error) => {
  console.error("PHASE5_FAIL", error.message);
  process.exit(1);
});
