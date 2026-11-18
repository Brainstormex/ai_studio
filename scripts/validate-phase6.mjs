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

async function waitForJob(token, projectId, type, timeoutMs = 180000, jobId = null) {
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
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

async function main() {
  console.log("Phase 6 validation against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase, "audio:", health.audioGenerationEnabled);
  if (health.phase < 6 || !health.audioGenerationEnabled) {
    throw new Error("API is not reporting Phase 6 audio generation");
  }

  const email = `phase6_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase6 Tester" }),
  });
  const token = registered.accessToken;

  const projectRes = await req("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Phase6 Audio Tracks",
      mode: "TOPIC_TO_VIDEO",
      topic: "A guide narrates a quiet river crossing at dawn.",
      targetDurationSeconds: 90,
      storyLanguage: "en",
      dialogueLanguage: "en",
      narrationLanguage: "en",
      voiceLanguage: "en",
      subtitleLanguage: "en",
      visualStyle: "DOCUMENTARY",
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

  await req(`/projects/${projectId}/video/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ regenerate: false }),
  });
  await waitForJob(token, projectId, "VIDEO_GENERATION", 300000);

  const nativeAudio = await req(`/projects/${projectId}/audio/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ regenerate: true, forceTts: false }),
  });
  await waitForJob(token, projectId, "AUDIO_GENERATION", 180000, nativeAudio.job.id);

  let status = await req(`/projects/${projectId}/audio/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!status.withAudio || status.withAudio < 1) {
    throw new Error("Expected audio segments after native confirm");
  }
  if (!status.subtitle?.assetId) {
    throw new Error("Expected subtitle draft asset");
  }

  const subtitleRes = await fetch(`${API}/assets/${status.subtitle.assetId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!subtitleRes.ok) throw new Error(`Subtitle asset failed: ${subtitleRes.status}`);
  const srt = await subtitleRes.text();
  if (!srt.includes("-->")) throw new Error("Subtitle content is not SRT");

  const forcedAudio = await req(`/projects/${projectId}/audio/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ regenerate: true, forceTts: true }),
  });
  await waitForJob(token, projectId, "AUDIO_GENERATION", 180000, forcedAudio.job.id);

  status = await req(`/projects/${projectId}/audio/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (status.tts < 1) {
    throw new Error(`Expected TTS segments after forceTts, got ${status.tts}`);
  }

  const ttsShot = status.shots.find((shot) => shot.segment?.source === "CLOUD_TTS" && shot.segment.assetId);
  if (!ttsShot?.segment?.assetId) {
    throw new Error("Expected a TTS audio asset");
  }
  const audioRes = await fetch(`${API}/assets/${ttsShot.segment.assetId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!audioRes.ok) throw new Error(`Audio asset failed: ${audioRes.status}`);
  const bytes = Buffer.from(await audioRes.arrayBuffer());
  if (bytes.length < 44) throw new Error("Audio asset too small");

  console.log(
    "audio ready:",
    status.withAudio,
    "native:",
    status.native,
    "tts:",
    status.tts,
    "subtitle:",
    status.subtitle.language,
  );
  console.log("PHASE6_OK");
}

main().catch((error) => {
  console.error("PHASE6_FAIL", error.message);
  process.exit(1);
});
