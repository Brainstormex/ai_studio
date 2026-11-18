"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, storeSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@studio.local");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await api.login({ email, password });
      storeSession(session);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-moss">Lumen Stage</p>
      <h1 className="font-display text-5xl leading-tight">Sign in to the studio</h1>
      <p className="mt-3 text-ink/70">
        Phase 1 foundation: projects, auth, and production planning. Generation unlocks in later
        phases.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Email</span>
          <input
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3 outline-none ring-accent focus:ring-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Password</span>
          <input
            className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3 outline-none ring-accent focus:ring-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-ink px-5 py-3 font-semibold text-paper transition hover:bg-accent disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-ink/70">
        No account?{" "}
        <Link href="/register" className="font-semibold text-accent underline-offset-2 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
