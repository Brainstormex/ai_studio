"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const session = getStoredSession();
    router.replace(session ? "/projects" : "/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center font-display text-3xl">
      Opening studio…
    </div>
  );
}
