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

async function main() {
  console.log("Phase 1 validation against", API);

  const health = await req("/health");
  console.log("health:", health.ok, health.checks);

  const email = `phase1_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase1 Tester" }),
  });
  console.log("register:", registered.user.email);

  const login = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  console.log("login: ok");

  const project = await req("/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: JSON.stringify({
      title: "Phase1 Validation Story",
      mode: "TOPIC_TO_VIDEO",
      topic: "A curious orange cat discovers a glowing forest.",
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
  console.log("create project:", project.project.id, "est $", project.project.estimatedCostUsd);

  const listed = await req("/projects", {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  console.log("list projects:", listed.projects.length);

  const detail = await req(`/projects/${project.project.id}`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  console.log("get project:", detail.project.title, detail.project.status);

  console.log("PHASE1_OK");
}

main().catch((error) => {
  console.error("PHASE1_FAIL", error.message);
  process.exit(1);
});
