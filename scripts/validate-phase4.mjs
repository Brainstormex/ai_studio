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

async function waitForJob(token, projectId, type, timeoutMs = 120000) {
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
  console.log("Phase 4 validation against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase);

  const email = `phase4_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase4 Tester" }),
  });
  const token = registered.accessToken;

  const projectRes = await req("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Phase4 Director Story",
      mode: "TOPIC_TO_VIDEO",
      topic: "A lantern fox guides a child through a whispering forest.",
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
  await waitForJob(token, projectId, "STORYBOARD_GENERATION");

  const board = await req(`/projects/${projectId}/storyboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!board.shotCount || board.shotCount < 1) {
    throw new Error("Expected storyboard shots");
  }
  const first = board.shots[0];
  if (!first.compactPrompt || first.compactPrompt.length < 10) {
    throw new Error("Expected compact prompts on shots");
  }
  if (first.targetDurationSec < 3 || first.targetDurationSec > 15) {
    throw new Error(`Shot duration out of bounds: ${first.targetDurationSec}`);
  }

  console.log(
    "shots:",
    board.shotCount,
    "plannedSeconds:",
    board.plannedSeconds,
    "strategy:",
    first.strategy,
  );
  console.log("PHASE4_OK");
}

main().catch((error) => {
  console.error("PHASE4_FAIL", error.message);
  process.exit(1);
});
