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

async function waitForJob(token, projectId, type, timeoutMs = 90000) {
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
  console.log("Phase 3 validation against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase, "image:", health.imageProvider);

  const email = `phase3_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase3 Tester" }),
  });
  const token = registered.accessToken;

  const projectRes = await req("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Phase3 Reference Story",
      mode: "TOPIC_TO_VIDEO",
      topic: "Two friends explore a lantern-lit forest at dusk.",
      targetDurationSeconds: 180,
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

  const refs = await req(`/projects/${projectId}/references`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const characterWithRef = refs.characters.find((item) => item.references.length > 0);
  const environmentWithRef = refs.environments.find((item) => item.references.length > 0);
  if (!characterWithRef || !environmentWithRef) {
    throw new Error("Missing character or environment references");
  }

  const assetId = characterWithRef.references[0].assetId;
  const assetRes = await fetch(`${API}/assets/${assetId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!assetRes.ok) {
    throw new Error(`Asset content failed: ${assetRes.status}`);
  }
  const bytes = Buffer.from(await assetRes.arrayBuffer());
  if (bytes.length < 100) {
    throw new Error("Asset content too small");
  }

  console.log(
    "refs characters:",
    refs.characters.length,
    "environments:",
    refs.environments.length,
    "assetBytes:",
    bytes.length,
  );
  console.log("PHASE3_OK");
}

main().catch((error) => {
  console.error("PHASE3_FAIL", error.message);
  process.exit(1);
});
