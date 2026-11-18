"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, clearSession, getStoredSession } from "@/lib/api";
import { useEffect, useState } from "react";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    setName(session?.user.name ?? null);
  }, [pathname]);

  async function onLogout() {
    await api.logout();
    clearSession();
    router.push("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-paper/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/projects" className="font-display text-2xl tracking-tight">
            Lumen Stage
          </Link>
          <nav className="flex items-center gap-6 text-sm font-semibold">
            <Link href="/projects" className={pathname.startsWith("/projects") ? "text-accent" : ""}>
              Projects
            </Link>
            <Link href="/projects/new" className={pathname === "/projects/new" ? "text-accent" : ""}>
              New
            </Link>
            {name ? (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-ink/15 px-3 py-1.5 hover:bg-ink/5"
              >
                {name} · Sign out
              </button>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
