"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api, getStoredSession, type ProjectSummary } from "@/lib/api";

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getStoredSession()) {
      router.replace("/login");
      return;
    }
    api
      .listProjects()
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <Shell>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-moss">Library</p>
          <h1 className="mt-2 font-display text-5xl">Projects</h1>
          <p className="mt-2 max-w-2xl text-ink/70">
            Create a topic-to-video or script-to-video project. Autonomous generation starts in later
            phases; Phase 1 stores production settings and cost estimates.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper hover:bg-accent"
        >
          New project
        </Link>
      </div>

      {loading ? <p className="mt-10 text-ink/60">Loading projects…</p> : null}
      {error ? <p className="mt-10 text-red-700">{error}</p> : null}

      {!loading && !error && projects.length === 0 ? (
        <div className="mt-12 border border-dashed border-ink/20 px-8 py-16 text-center">
          <h2 className="font-display text-3xl">No projects yet</h2>
          <p className="mt-2 text-ink/70">Start with a topic or an uploaded script.</p>
          <Link
            href="/projects/new"
            className="mt-6 inline-block rounded-full bg-accent px-5 py-3 text-sm font-semibold text-paper"
          >
            Create first project
          </Link>
        </div>
      ) : null}

      <div className="mt-10 grid gap-4">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="block border border-ink/10 bg-white/50 px-6 py-5 transition hover:border-accent/40 hover:bg-white/80"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">{project.title}</h2>
                <p className="mt-1 text-sm text-ink/65">
                  {project.mode.replaceAll("_", " ")} · {formatDuration(project.targetDurationSeconds)} ·{" "}
                  {project.storyLanguage.toUpperCase()} · {project.visualStyle.replaceAll("_", " ")}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold uppercase tracking-wide text-moss">{project.status}</p>
                <p className="mt-1 text-ink/65">
                  Est. ${Number(project.estimatedCostUsd ?? 0).toFixed(2)} · Actual $
                  {Number(project.actualCostUsd ?? 0).toFixed(2)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
