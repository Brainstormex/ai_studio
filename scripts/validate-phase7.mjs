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

async function waitUntil(token, projectId, predicate, label, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await req(`/projects/${projectId}/orchestration/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (predicate(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function advanceUntil(token, projectId, stageId, timeoutMs = 300000) {
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
        body: JSON.stringify({ through: stageId === "audio" ? "audio" : stageId }),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out advancing to ${stageId}`);
}

async function main() {
  console.log("Phase 7 validation against", API);
  const health = await req("/health");
  console.log("health phase:", health.phase, "orchestration:", health.orchestrationEnabled);
  if (health.phase < 7 || !health.orchestrationEnabled) {
    throw new Error("API is not reporting Phase 7 orchestration");
  }

  const email = `phase7_${Date.now()}@studio.local`;
  const password = "Validate123!";
  const registered = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Phase7 Tester" }),
  });
  const token = registered.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  const projectRes = await req("/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Phase7 Orchestration",
      mode: "TOPIC_TO_VIDEO",
      topic: "A courier races across rooftops before a monsoon.",
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

  await advanceUntil(token, projectId, "storyboard");
  await advanceUntil(token, projectId, "video");
  await advanceUntil(token, projectId, "quality-control");

  const afterQc = await req(`/projects/${projectId}/orchestration/status`, { headers });
  const qcStage = afterQc.stages.find((item) => item.id === "quality-control");
  if (!qcStage?.complete) throw new Error("Expected QC stage complete");

  await req(`/projects/${projectId}/orchestration/pause`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const paused = await req(`/projects/${projectId}`, { headers });
  if (paused.project.status !== "PAUSED") throw new Error("Expected PAUSED status");

  await req(`/projects/${projectId}/orchestration/resume`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  await advanceUntil(token, projectId, "audio");

  const finalStatus = await waitUntil(
    token,
    projectId,
    (status) => status.stages.every((stage) => stage.complete) || status.nextStage === null,
    "full pipeline",
  );

  const cancelProject = await req("/projects", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Phase7 Cancel Me",
      mode: "TOPIC_TO_VIDEO",
      topic: "A balloon escapes into the night sky.",
      targetDurationSeconds: 60,
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
  const cancelId = cancelProject.project.id;
  await req(`/projects/${cancelId}/orchestration/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ through: "planning" }),
  });
  await req(`/projects/${cancelId}/orchestration/cancel`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const cancelled = await req(`/projects/${cancelId}`, { headers });
  if (cancelled.project.status !== "CANCELLED") {
    throw new Error(`Expected CANCELLED status, got ${cancelled.project.status}`);
  }

  console.log(
    "stages complete:",
    finalStatus.stages.filter((s) => s.complete).map((s) => s.id).join(","),
    "cancel:",
    cancelled.project.status,
  );
  console.log("PHASE7_OK");
}

main().catch((error) => {
  console.error("PHASE7_FAIL", error.message);
  process.exit(1);
});
