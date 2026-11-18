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

async function waitForJob(token, projectId, type, timeoutMs = 60000) {
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
  console.log("Phase 2 validation against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase, "llm:", health.llmProvider);

  const email = `phase2_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase2 Tester" }),
  });
  const token = registered.accessToken;

  const topicProject = await req("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Phase2 Topic Story",
      mode: "TOPIC_TO_VIDEO",
      topic: "A little orange cat discovers a mysterious glowing forest.",
      targetDurationSeconds: 300,
      storyLanguage: "en",
      dialogueLanguage: "en",
      narrationLanguage: "en",
      voiceLanguage: "en",
      subtitleLanguage: "en",
      visualStyle: "ANIMATION_2D",
      resolution: "P720",
      aspectRatio: "LANDSCAPE_16_9",
      videoProvider: "google-omni",
      budgetLimitUsd: 40,
    }),
  });

  await req(`/projects/${topicProject.project.id}/generation/story`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ regenerate: false }),
  });
  await waitForJob(token, topicProject.project.id, "STORY_GENERATION");
  const topicScreenplay = await req(
    `/projects/${topicProject.project.id}/generation/screenplay`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  console.log(
    "topic screenplay characters:",
    topicScreenplay.characters.length,
    "episodes:",
    topicScreenplay.episodes.length,
  );

  const scriptProject = await req("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Phase2 Script Story",
      mode: "SCRIPT_TO_VIDEO",
      targetDurationSeconds: 180,
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

  const form = new FormData();
  form.append(
    "scriptText",
    [
      "TITLE: The Lantern Path",
      "NARRATOR: At dusk, Mira enters the forest.",
      "MIRA: Pip, stay close.",
      "PIP: The lanterns are waking up.",
      "They follow the glowing trail to a hidden cottage.",
    ].join("\n"),
  );

  const scriptRes = await fetch(`${API}/projects/${scriptProject.project.id}/generation/script`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const scriptData = await scriptRes.json();
  if (!scriptRes.ok) throw new Error(scriptData.error ?? "script upload failed");
  await waitForJob(token, scriptProject.project.id, "SCRIPT_ANALYSIS");
  const scriptScreenplay = await req(
    `/projects/${scriptProject.project.id}/generation/screenplay`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  console.log(
    "script screenplay characters:",
    scriptScreenplay.characters.length,
    "scenes:",
    scriptScreenplay.episodes[0]?.chapters?.[0]?.scenes?.length ?? 0,
  );

  console.log("PHASE2_OK");
}

main().catch((error) => {
  console.error("PHASE2_FAIL", error.message);
  process.exit(1);
});
