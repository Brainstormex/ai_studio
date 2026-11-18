"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getStoredSession } from "@/lib/api";

const MODES = [
  { value: "TOPIC_TO_VIDEO", label: "Topic to Video" },
  { value: "SCRIPT_TO_VIDEO", label: "Script to Video" },
  { value: "VIDEO_REFERENCE", label: "Video Reference" },
];

const STYLES = [
  "CINEMATIC",
  "ANIMATION_2D",
  "ANIMATION_3D",
  "REALISTIC",
  "DOCUMENTARY",
  "EDUCATIONAL",
  "CARTOON",
  "ANIME",
  "EXPLAINER",
  "CUSTOM",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "bn", label: "Bengali" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("TOPIC_TO_VIDEO");
  const [topic, setTopic] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [storyLanguage, setStoryLanguage] = useState("en");
  const [dialogueLanguage, setDialogueLanguage] = useState("en");
  const [narrationLanguage, setNarrationLanguage] = useState("en");
  const [voiceLanguage, setVoiceLanguage] = useState("en");
  const [subtitleLanguage, setSubtitleLanguage] = useState("en");
  const [visualStyle, setVisualStyle] = useState("CINEMATIC");
  const [customStyleNotes, setCustomStyleNotes] = useState("");
  const [resolution, setResolution] = useState("P720");
  const [aspectRatio, setAspectRatio] = useState("LANDSCAPE_16_9");
  const [budgetLimitUsd, setBudgetLimitUsd] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getStoredSession()) router.replace("/login");
  }, [router]);

  const estimate = useMemo(() => {
    const seconds = durationMinutes * 60;
    const rate = resolution === "P4K" ? 0.209 : resolution === "P1080" ? 0.104 : 0.07;
    return (seconds * rate).toFixed(2);
  }, [durationMinutes, resolution]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { project } = await api.createProject({
        title,
        mode,
        topic: topic || undefined,
        targetDurationSeconds: durationMinutes * 60,
        storyLanguage,
        dialogueLanguage,
        narrationLanguage,
        voiceLanguage,
        subtitleLanguage,
        visualStyle,
        customStyleNotes: customStyleNotes || undefined,
        resolution,
        aspectRatio,
        videoProvider: "google-omni",
        budgetLimitUsd: budgetLimitUsd ? Number(budgetLimitUsd) : undefined,
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-moss">New production</p>
      <h1 className="mt-2 font-display text-5xl">Create project</h1>
      <p className="mt-2 max-w-2xl text-ink/70">
        Configure mode, duration, languages, and style. Video generation is disabled until Phase 5 —
        settings and cost estimates are stored now.
      </p>

      <form onSubmit={onSubmit} className="mt-8 grid gap-6 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-semibold">Title</span>
          <input
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Generation mode</span>
          <select
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {MODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Target duration (minutes)</span>
          <input
            type="number"
            min={1}
            max={120}
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            required
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-semibold">
            {mode === "TOPIC_TO_VIDEO" ? "Topic / idea" : "Script notes (upload wiring in Phase 2)"}
          </span>
          <textarea
            className="min-h-32 w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Create a 20-minute animated adventure about a little orange cat..."
          />
        </label>

        {(
          [
            ["Story language", storyLanguage, setStoryLanguage],
            ["Dialogue language", dialogueLanguage, setDialogueLanguage],
            ["Narration language", narrationLanguage, setNarrationLanguage],
            ["Voice language", voiceLanguage, setVoiceLanguage],
            ["Subtitle language", subtitleLanguage, setSubtitleLanguage],
          ] as const
        ).map(([label, value, setter]) => (
          <label key={label} className="block">
            <span className="mb-1 block text-sm font-semibold">{label}</span>
            <select
              className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
              value={value}
              onChange={(e) => setter(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Visual style</span>
          <select
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={visualStyle}
            onChange={(e) => setVisualStyle(e.target.value)}
          >
            {STYLES.map((style) => (
              <option key={style} value={style}>
                {style.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Resolution</span>
          <select
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            <option value="P720">720p</option>
            <option value="P1080">1080p</option>
            <option value="P4K">4K</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Aspect ratio</span>
          <select
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            <option value="LANDSCAPE_16_9">16:9 Landscape</option>
            <option value="PORTRAIT_9_16">9:16 Portrait</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Budget limit (USD)</span>
          <input
            type="number"
            min={1}
            step="0.01"
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={budgetLimitUsd}
            onChange={(e) => setBudgetLimitUsd(e.target.value)}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-semibold">Custom style notes</span>
          <textarea
            className="min-h-24 w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3"
            value={customStyleNotes}
            onChange={(e) => setCustomStyleNotes(e.target.value)}
          />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 border border-ink/10 bg-white/40 px-5 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-moss">Cost estimate</p>
            <p className="font-display text-3xl">${estimate}</p>
            <p className="text-sm text-ink/65">
              Video-only estimate at Omni ~720p pricing. LLM/image costs tracked separately later.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-ink px-6 py-3 font-semibold text-paper hover:bg-accent disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create project"}
          </button>
        </div>
        {error ? <p className="md:col-span-2 text-sm text-red-700">{error}</p> : null}
      </form>
    </Shell>
  );
}
