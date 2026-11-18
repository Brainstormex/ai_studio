"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import {
  api,
  getStoredSession,
  type GenerationJob,
  type ProjectDetail,
  type ReferencesResponse,
  type ScreenplayResponse,
  type AudioStatusResponse,
  type OrchestrationStatus,
  type RenderStatusResponse,
  type StoryboardResponse,
  type VideoStatusResponse,
  type TimelineResponse,
  type CostsResponse,
} from "@/lib/api";
import { AuthImage } from "@/components/AuthImage";
import { AuthVideo } from "@/components/AuthVideo";
import { AuthAudio } from "@/components/AuthAudio";

function formatTimecode(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [screenplay, setScreenplay] = useState<ScreenplayResponse | null>(null);
  const [references, setReferences] = useState<ReferencesResponse | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardResponse | null>(null);
  const [videoStatus, setVideoStatus] = useState<VideoStatusResponse | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatusResponse | null>(null);
  const [orchestration, setOrchestration] = useState<OrchestrationStatus | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatusResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [costs, setCosts] = useState<CostsResponse | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [sseMessage, setSseMessage] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [continueSeconds, setContinueSeconds] = useState(120);
  const [continueInstruction, setContinueInstruction] = useState("");

  const refresh = useCallback(async () => {
    const [
      projectRes,
      screenplayRes,
      jobsRes,
      referencesRes,
      storyboardRes,
      videoRes,
      audioRes,
      orchRes,
      renderRes,
      timelineRes,
      costsRes,
    ] = await Promise.all([
      api.getProject(params.id),
      api.getScreenplay(params.id),
      api.getJobs(params.id),
      api.getReferences(params.id),
      api.getStoryboard(params.id),
      api.getVideoStatus(params.id),
      api.getAudioStatus(params.id),
      api.getOrchestration(params.id),
      api.getRenderStatus(params.id),
      api.getTimeline(params.id),
      api.getCosts(params.id),
    ]);
    setProject(projectRes.project);
    setScreenplay(screenplayRes);
    setJobs(jobsRes.jobs);
    setReferences(referencesRes);
    setStoryboard(storyboardRes);
    setVideoStatus(videoRes);
    setAudioStatus(audioRes);
    setOrchestration(orchRes);
    setRenderStatus(renderRes);
    setTimeline(timelineRes);
    setCosts(costsRes);
  }, [params.id]);



  useEffect(() => {
    if (!getStoredSession()) {
      router.replace("/login");
      return;
    }
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load project"));
  }, [params.id, router, refresh]);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`${apiUrl}/sse/projects/${params.id}/events`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          setSseMessage("SSE unavailable");
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
            if (dataLine) {
              try {
                const data = JSON.parse(dataLine.slice(6));
                setSseMessage(data.message ?? JSON.stringify(data));
                if (data.status === "QUEUED" || data.type) {
                  void refresh();
                }
              } catch {
                setSseMessage(dataLine.slice(6));
              }
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) setSseMessage("SSE disconnected");
      }
    })();
    return () => controller.abort();
  }, [params.id, refresh]);

  useEffect(() => {
    const hasActive = jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING");
    if (!hasActive) return;
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [jobs, refresh]);

  async function onGenerateStory() {
    setBusy(true);
    setError(null);
    try {
      await api.generateStory(params.id, true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Story generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyzeScript() {
    setBusy(true);
    setError(null);
    try {
      await api.uploadScript(params.id, file ?? undefined, scriptText || undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Script analysis failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !project) {
    return (
      <Shell>
        <p className="text-red-700">{error}</p>
      </Shell>
    );
  }

  if (!project) {
    return (
      <Shell>
        <p className="text-ink/60">Loading project…</p>
      </Shell>
    );
  }

  const storyStatus = jobs.find((job) => job.type === "STORY_GENERATION")?.status ?? "Not started";
  const scriptStatus = jobs.find((job) => job.type === "SCRIPT_ANALYSIS")?.status ?? "Not started";
  const characterStatus =
    jobs.find((job) => job.type === "CHARACTER_GENERATION")?.status ?? "Not started";
  const environmentStatus =
    jobs.find((job) => job.type === "ENVIRONMENT_GENERATION")?.status ?? "Not started";
  const storyboardStatus =
    jobs.find((job) => job.type === "STORYBOARD_GENERATION")?.status ?? "Not started";
  const videoStatusLabel =
    jobs.find((job) => job.type === "VIDEO_GENERATION")?.status ?? "Not started";
  const audioStatusLabel =
    jobs.find((job) => job.type === "AUDIO_GENERATION")?.status ?? "Not started";
  const continueStatus =
    jobs.find((job) => job.type === "EPISODE_CONTINUATION")?.status ?? "Not started";

  async function onRegenerateCharacters() {
    setBusy(true);
    setError(null);
    try {
      await api.generateCharacterRefs(params.id, true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Character reference generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRegenerateEnvironments() {
    setBusy(true);
    setError(null);
    try {
      await api.generateEnvironmentRefs(params.id, true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Environment reference generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateStoryboard() {
    setBusy(true);
    setError(null);
    try {
      await api.generateStoryboard(params.id, true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Storyboard generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onStartVideo(regenerate = false) {
    setBusy(true);
    setError(null);
    try {
      await api.startVideo(params.id, regenerate);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRetryShot(shotId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.retryShotVideo(params.id, shotId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shot retry failed");
    } finally {
      setBusy(false);
    }
  }

  async function onStartAudio(forceTts = false) {
    setBusy(true);
    setError(null);
    try {
      await api.startAudio(params.id, { regenerate: true, forceTts });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRetryAudio(shotId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.retryShotAudio(params.id, shotId, true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio retry failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAdvancePipeline() {
    setBusy(true);
    setError(null);
    try {
      await api.runOrchestration(params.id, { through: "render" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline advance failed");
    } finally {
      setBusy(false);
    }
  }

  async function onStartRender() {
    setBusy(true);
    setError(null);
    try {
      await api.startRender(params.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPause() {
    setBusy(true);
    setError(null);
    try {
      await api.pauseOrchestration(params.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pause failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResume() {
    setBusy(true);
    setError(null);
    try {
      await api.resumeOrchestration(params.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelOrchestration(params.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function onContinueEpisode() {
    setBusy(true);
    setError(null);
    try {
      await api.continueEpisode(params.id, {
        additionalSeconds: continueSeconds,
        instruction: continueInstruction.trim() || undefined,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Continue episode failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-moss">{project.status}</p>
      <h1 className="mt-2 font-display text-5xl">{project.title}</h1>
      <p className="mt-3 max-w-3xl text-ink/70">{project.topic || "No topic provided."}</p>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Orchestration</h2>
            <p className="mt-2 text-sm text-ink/65">
              Dependency-aware stages with pause/resume/cancel. Video still requires an explicit
              advance so spend stays intentional. QC runs automatically after video and audio.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              Next: {orchestration?.nextStage ?? "done"} · progress{" "}
              {orchestration?.progressPercent ?? project.progressPercent}%
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || project.status === "CANCELLED"}
              onClick={onAdvancePipeline}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
            >
              {busy ? "Queuing…" : "Advance pipeline"}
            </button>
            <button
              type="button"
              disabled={busy || project.status === "PAUSED" || project.status === "CANCELLED"}
              onClick={onPause}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-60"
            >
              Pause
            </button>
            <button
              type="button"
              disabled={busy || project.status !== "PAUSED"}
              onClick={onResume}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-60"
            >
              Resume
            </button>
            <button
              type="button"
              disabled={busy || project.status === "CANCELLED"}
              onClick={onCancel}
              className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-2 md:grid-cols-3">
          {(orchestration?.stages ?? []).map((stage) => (
            <div key={stage.id} className="border border-ink/10 px-4 py-3">
              <p className="font-semibold capitalize">{stage.id.replaceAll("-", " ")}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-moss">
                {stage.complete ? "complete" : stage.status.replaceAll("_", " ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat label="Duration" value={`${Math.round(project.targetDurationSeconds / 60)} min`} />
        <Stat label="Style" value={project.visualStyle.replaceAll("_", " ")} />
        <Stat label="Resolution" value={project.resolution.replace("P", "") + "p"} />
        <Stat label="Story language" value={project.storyLanguage.toUpperCase()} />
        <Stat label="Estimated cost" value={`$${Number(project.estimatedCostUsd ?? 0).toFixed(2)}`} />
        <Stat label="Actual cost" value={`$${Number(project.actualCostUsd ?? 0).toFixed(2)}`} />
      </div>

      <section className="mt-10 border border-ink/10 bg-white/50 px-6 py-5">
        <h2 className="font-display text-2xl">Phase 2 · Script pipeline</h2>
        <p className="mt-2 text-sm text-ink/65">
          Generate a structured screenplay from a topic, or upload/parse an existing script. Start
          Omni clip generation explicitly after the storyboard is ready.
        </p>

        {project.mode === "TOPIC_TO_VIDEO" ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onGenerateStory}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
            >
              {busy ? "Queuing…" : "Generate screenplay"}
            </button>
            <span className="text-sm text-ink/65">Story job: {storyStatus}</span>
          </div>
        ) : null}

        {project.mode === "SCRIPT_TO_VIDEO" ? (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Upload TXT / PDF / DOCX / SRT</span>
              <input
                type="file"
                accept=".txt,.pdf,.docx,.srt,text/plain,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Or paste script text</span>
              <textarea
                className="min-h-28 w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={onAnalyzeScript}
                className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
              >
                {busy ? "Queuing…" : "Analyze script"}
              </button>
              <span className="text-sm text-ink/65">Script job: {scriptStatus}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {[
            ["Story generation", storyStatus],
            ["Script analysis", scriptStatus],
            ["Character generation", characterStatus],
            ["Environment generation", environmentStatus],
            ["Storyboard / AI Director", storyboardStatus],
            ["Video generation", videoStatusLabel],
            [
              "Quality control",
              jobs.find((job) => job.type === "QUALITY_CONTROL")?.status ?? "Not started",
            ],
            ["Audio / TTS", audioStatusLabel],
            [
              "Final render",
              jobs.find((job) => job.type === "VIDEO_RENDERING")?.status ?? "Not started",
            ],
            ["Continue episode", continueStatus],
          ].map(([step, status]) => (

            <div key={step} className="flex items-center justify-between border border-ink/10 px-4 py-3">
              <span className="font-semibold">{step}</span>
              <span className="text-sm uppercase tracking-wide text-ink/50">{status}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink/65">Live feed: {sseMessage}</p>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <Panel title="Episodes" count={screenplay?.episodes.length ?? project.episodes.length} />
        <Panel title="Characters" count={screenplay?.characters.length ?? project.characters.length} />
        <Panel
          title="Environments"
          count={screenplay?.environments.length ?? project.environments.length}
        />
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Reference library</h2>
            <p className="mt-2 text-sm text-ink/65">
              Character and environment stills are generated after screenplay creation and reused
              across later shots.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onRegenerateCharacters}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-60"
            >
              Regenerate characters
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onRegenerateEnvironments}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-60"
            >
              Regenerate environments
            </button>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-moss">Characters</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(references?.characters ?? []).map((character) => {
              const primary = character.references.find((ref) => ref.isPrimary) ?? character.references[0];
              return (
                <div key={character.id} className="border border-ink/10 bg-white/60 p-3">
                  {primary ? (
                    <AuthImage
                      src={api.assetUrl(primary.assetId)}
                      alt={character.name}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-ink/5 text-sm text-ink/50">
                      Pending
                    </div>
                  )}
                  <p className="mt-2 font-display text-lg">{character.name}</p>
                  <p className="text-sm text-ink/65">{character.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-moss">Environments</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(references?.environments ?? []).map((environment) => {
              const primary =
                environment.references.find((ref) => ref.isPrimary) ?? environment.references[0];
              return (
                <div key={environment.id} className="border border-ink/10 bg-white/60 p-3">
                  {primary ? (
                    <AuthImage
                      src={api.assetUrl(primary.assetId)}
                      alt={environment.name}
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-ink/5 text-sm text-ink/50">
                      Pending
                    </div>
                  )}
                  <p className="mt-2 font-display text-lg">{environment.name}</p>
                  <p className="text-sm text-ink/65">{environment.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">AI Director storyboard</h2>
            <p className="mt-2 text-sm text-ink/65">
              Compact shot plans with camera, strategy, and continuity. Full screenplay is not sent
              per shot—only these instructions are reused later for video generation.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              {storyboard?.shotCount ?? 0} shots · {storyboard?.plannedSeconds ?? 0}s planned · job:{" "}
              {storyboardStatus}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onGenerateStoryboard}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
          >
            {busy ? "Queuing…" : "Regenerate storyboard"}
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {(storyboard?.shots ?? []).map((shot) => (
            <div key={shot.id} className="border border-ink/10 bg-white/60 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">
                  Ch {shot.chapterNumber} · Scene {shot.sceneNumber} · Shot {shot.number}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-moss">
                  {shot.strategy.replaceAll("_", " ")} · {shot.targetDurationSec}s
                </p>
              </div>
              <p className="mt-1 text-sm text-ink/75">{shot.description}</p>
              <p className="mt-2 text-xs text-ink/55">
                Camera: {shot.cameraAngle ?? "n/a"} / {shot.cameraMovement ?? "n/a"}
                {shot.characterNames.length
                  ? ` · Cast: ${shot.characterNames.filter(Boolean).join(", ")}`
                  : ""}
                {shot.locationName ? ` · Loc: ${shot.locationName}` : ""}
              </p>
              {shot.compactPrompt ? (
                <p className="mt-2 rounded bg-ink/5 px-3 py-2 font-mono text-xs text-ink/70">
                  {shot.compactPrompt}
                </p>
              ) : null}
            </div>
          ))}
          {(storyboard?.shots.length ?? 0) === 0 ? (
            <p className="text-sm text-ink/55">
              Storyboard appears after references complete, or click regenerate.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Omni video clips</h2>
            <p className="mt-2 text-sm text-ink/65">
              Generate 3–15s clips in shot order. EXTEND shots continue from the previous
              interaction. Start is explicit so cost stays under control.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              {videoStatus?.succeeded ?? 0}/{videoStatus?.total ?? 0} succeeded ·{" "}
              {videoStatus?.generatedSeconds ?? 0}s generated · job: {videoStatusLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (storyboard?.shotCount ?? 0) === 0}
              onClick={() => onStartVideo(false)}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
            >
              {busy ? "Queuing…" : "Start video generation"}
            </button>
            <button
              type="button"
              disabled={busy || (storyboard?.shotCount ?? 0) === 0}
              onClick={() => onStartVideo(true)}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-60"
            >
              Regenerate all clips
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {(videoStatus?.shots ?? []).map((shot) => (
            <div key={shot.shotId} className="border border-ink/10 bg-white/60 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Shot {shot.number} · {shot.strategy.replaceAll("_", " ")} ·{" "}
                    {shot.targetDurationSec}s
                  </p>
                  <p className="mt-1 text-sm text-ink/70">{shot.description}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-moss">{shot.status}</p>
                  {shot.segment?.errorMessage ? (
                    <p className="mt-1 text-xs text-red-700">{shot.segment.errorMessage}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRetryShot(shot.shotId)}
                  className="rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold hover:bg-ink/5 disabled:opacity-60"
                >
                  Retry
                </button>
              </div>
              {shot.segment?.assetId ? (
                <AuthVideo
                  src={api.assetUrl(shot.segment.assetId)}
                  className="mt-3 aspect-video w-full max-w-xl bg-ink/5"
                />
              ) : null}
            </div>
          ))}
          {(videoStatus?.shots.length ?? 0) === 0 ? (
            <p className="text-sm text-ink/55">
              Video clips appear after you start generation on a completed storyboard.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Audio modularity</h2>
            <p className="mt-2 text-sm text-ink/65">
              Prefer Omni native audio in-clip. Use Cloud TTS only for narration, dubbing, or
              voice fixes. Subtitle cues are drafted from spoken lines.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              {audioStatus?.withAudio ?? 0}/{audioStatus?.total ?? 0} ready · native{" "}
              {audioStatus?.native ?? 0} · TTS {audioStatus?.tts ?? 0} · job: {audioStatusLabel}
              {audioStatus?.subtitle
                ? ` · SRT ${audioStatus.subtitle.language.toUpperCase()}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (storyboard?.shotCount ?? 0) === 0}
              onClick={() => onStartAudio(false)}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
            >
              {busy ? "Queuing…" : "Confirm native audio"}
            </button>
            <button
              type="button"
              disabled={busy || (storyboard?.shotCount ?? 0) === 0}
              onClick={() => onStartAudio(true)}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold hover:bg-ink/5 disabled:opacity-60"
            >
              Force Cloud TTS
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {(audioStatus?.shots ?? []).map((shot) => (
            <div key={shot.shotId} className="border border-ink/10 bg-white/60 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Shot {shot.number} · {shot.segment?.source?.replaceAll("_", " ") ?? "pending"}
                  </p>
                  <p className="mt-1 text-sm text-ink/70">
                    {shot.dialogue || shot.narration || "No spoken line"}
                  </p>
                  {shot.segment?.errorMessage ? (
                    <p className="mt-1 text-xs text-red-700">{shot.segment.errorMessage}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRetryAudio(shot.shotId)}
                  className="rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold hover:bg-ink/5 disabled:opacity-60"
                >
                  TTS retry
                </button>
              </div>
              {shot.segment?.assetId ? (
                <AuthAudio
                  src={api.assetUrl(shot.segment.assetId)}
                  className="mt-3 w-full max-w-xl"
                />
              ) : null}
            </div>
          ))}
          {(audioStatus?.shots.length ?? 0) === 0 ? (
            <p className="text-sm text-ink/55">
              Audio status appears after storyboard shots exist. Confirm native tracks or force TTS.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Shot timeline</h2>
            <p className="mt-2 text-sm text-ink/65">
              Chronological shot rail with clip status and dialogue/audio markers across episodes.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              {timeline?.totalShots ?? 0} shots · {formatTimecode(timeline?.totalSeconds ?? 0)} ·{" "}
              {timeline?.succeeded ?? 0} ready · {timeline?.failed ?? 0} failed
            </p>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <div className="flex min-w-full gap-2 pb-2">
            {(timeline?.items ?? []).map((item) => (
              <div
                key={item.shotId}
                className="w-44 shrink-0 border border-ink/10 bg-white/70 px-3 py-3"
                style={{ minWidth: `${Math.max(9, item.durationSec) * 8}px` }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-moss">
                  {formatTimecode(item.startSeconds)}–{formatTimecode(item.endSeconds)}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  E{item.episodeNumber} · S{item.sceneNumber} · #{item.shotNumber}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-ink/70">{item.description}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-ink/50">
                  {item.status.replaceAll("_", " ")} · {item.strategy.replaceAll("_", " ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold uppercase tracking-wide">
                  {item.markers.hasVideo ? (
                    <span className="border border-moss/40 px-1.5 py-0.5 text-moss">Video</span>
                  ) : null}
                  {item.markers.hasAudio ? (
                    <span className="border border-ink/20 px-1.5 py-0.5 text-ink/70">Audio</span>
                  ) : null}
                  {item.markers.hasDialogue ? (
                    <span className="border border-ink/20 px-1.5 py-0.5 text-ink/70">Dlg</span>
                  ) : null}
                  {item.markers.hasNarration ? (
                    <span className="border border-ink/20 px-1.5 py-0.5 text-ink/70">Nar</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {(timeline?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-ink/55">Timeline fills in after storyboard shots exist.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Cost & usage</h2>
            <p className="mt-2 text-sm text-ink/65">
              Live spend by provider and operation. Video seconds dominate long-form budgets.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              Actual ${Number(costs?.totals.actualUsd ?? project.actualCostUsd ?? 0).toFixed(4)} ·
              estimated $
              {Number(costs?.totals.estimatedUsd ?? project.estimatedCostUsd ?? 0).toFixed(4)}
              {costs?.project.budgetLimitUsd != null
                ? ` · budget $${costs.project.budgetLimitUsd.toFixed(2)}`
                : ""}
              {costs?.budget?.remainingUsd != null
                ? ` · remaining $${costs.budget.remainingUsd.toFixed(4)}`
                : ""}
            </p>
            {costs?.budget?.overBudget ? (
              <p className="mt-2 text-sm text-red-700">
                Budget exceeded for pending video (~$
                {costs.budget.pendingVideoEstimateUsd.toFixed(4)} projected). Raise the limit or
                reduce shots before generating clips.
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Stat label="Video seconds" value={`${Number(costs?.totals.videoSeconds ?? 0).toFixed(1)}s`} />
          <Stat label="Images" value={String(costs?.totals.imageCount ?? 0)} />
          <Stat
            label="LLM tokens"
            value={`${((costs?.totals.inputTokens ?? 0) + (costs?.totals.outputTokens ?? 0)).toLocaleString()}`}
          />
          <Stat label="TTS chars" value={(costs?.totals.audioChars ?? 0).toLocaleString()} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-moss">By provider</p>
            <div className="mt-2 space-y-2">
              {(costs?.byProvider ?? []).map((row) => (
                <div
                  key={row.provider}
                  className="flex items-center justify-between border border-ink/10 px-3 py-2 text-sm"
                >
                  <span className="font-semibold">{row.provider}</span>
                  <span className="text-ink/65">
                    ${row.actualUsd.toFixed(4)} · {row.operations} ops
                  </span>
                </div>
              ))}
              {(costs?.byProvider.length ?? 0) === 0 ? (
                <p className="text-sm text-ink/55">No usage recorded yet.</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-moss">By operation</p>
            <div className="mt-2 space-y-2">
              {(costs?.byOperation ?? []).slice(0, 8).map((row) => (
                <div
                  key={`${row.provider}:${row.operation}`}
                  className="flex items-center justify-between border border-ink/10 px-3 py-2 text-sm"
                >
                  <span className="font-semibold">
                    {row.operation}
                    <span className="ml-2 text-xs font-normal text-ink/45">{row.provider}</span>
                  </span>
                  <span className="text-ink/65">
                    ${row.actualUsd.toFixed(4)} · ×{row.count}
                  </span>
                </div>
              ))}
              {(costs?.byOperation.length ?? 0) === 0 ? (
                <p className="text-sm text-ink/55">No operations yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Continue story</h2>
            <p className="mt-2 text-sm text-ink/65">
              Append the next episode without wiping characters, locations, or prior shots.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              Episodes: {screenplay?.episodes.length ?? timeline?.episodes.length ?? 0} · job:{" "}
              {continueStatus}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Added seconds</span>
            <input
              type="number"
              min={30}
              max={3600}
              value={continueSeconds}
              onChange={(e) => setContinueSeconds(Number(e.target.value) || 120)}
              className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Direction (optional)</span>
            <input
              type="text"
              value={continueInstruction}
              onChange={(e) => setContinueInstruction(e.target.value)}
              placeholder="Raise the stakes at the lighthouse"
              className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={busy || (screenplay?.episodes.length ?? 0) < 1}
              onClick={onContinueEpisode}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
            >
              {busy ? "Queuing…" : "Generate next episode"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Final FFmpeg render</h2>
            <p className="mt-2 text-sm text-ink/65">
              Normalize and concat clips, mix TTS where needed, burn subtitles, add title and
              credits, then store the master MP4.
            </p>
            <p className="mt-1 text-sm text-ink/65">
              Status: {renderStatus?.latest?.status ?? "Not started"}
              {renderStatus?.latest?.sizeBytes
                ? ` · ${(renderStatus.latest.sizeBytes / 1024).toFixed(1)} KB`
                : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || (videoStatus?.succeeded ?? 0) < 1}
            onClick={onStartRender}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent disabled:opacity-60"
          >
            {busy ? "Queuing…" : "Render master MP4"}
          </button>
        </div>
        {renderStatus?.latest?.outputAssetId ? (
          <AuthVideo
            src={api.assetUrl(renderStatus.latest.outputAssetId)}
            className="mt-5 aspect-video w-full max-w-3xl bg-ink/5"
          />
        ) : null}
        {renderStatus?.latest?.errorMessage ? (
          <p className="mt-3 text-sm text-red-700">{renderStatus.latest.errorMessage}</p>
        ) : null}
      </section>

      {screenplay?.storySummary ? (
        <section className="mt-8 border border-ink/10 bg-white/50 px-6 py-5">
          <h2 className="font-display text-2xl">Screenplay</h2>
          <p className="mt-3 text-ink/75">{screenplay.storySummary}</p>
          <div className="mt-5 space-y-4">
            {screenplay.episodes.map((episode) => (
              <div key={episode.id}>
                <h3 className="font-display text-xl">{episode.title}</h3>
                {episode.chapters.map((chapter) => (
                  <div key={chapter.id} className="mt-3 border-l border-ink/15 pl-4">
                    <p className="font-semibold">
                      Chapter {chapter.number}: {chapter.title}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-ink/70">
                      {chapter.scenes.map((scene) => (
                        <li key={scene.id}>
                          Scene {scene.number}: {scene.title}
                          {scene.summary ? ` — ${scene.summary}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-moss">Characters</p>
              <ul className="mt-2 space-y-1 text-sm">
                {screenplay.characters.map((character) => (
                  <li key={character.id}>
                    <span className="font-semibold">{character.name}</span>
                    {character.description ? ` — ${character.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-moss">Locations</p>
              <ul className="mt-2 space-y-1 text-sm">
                {screenplay.environments.map((environment) => (
                  <li key={environment.id}>
                    <span className="font-semibold">{environment.name}</span>
                    {environment.description ? ` — ${environment.description}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-white/40 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-moss">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </div>
  );
}

function Panel({ title, count }: { title: string; count: number }) {
  return (
    <div className="border border-ink/10 bg-white/40 px-4 py-4">
      <p className="font-display text-xl">{title}</p>
      <p className="mt-1 text-ink/65">{count} ready</p>
    </div>
  );
}
