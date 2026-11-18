"use client";

import { useEffect, useState } from "react";
import { getStoredSession } from "@/lib/api";

export function AuthVideo({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) return;
    const controller = new AbortController();
    setFailed(false);
    (async () => {
      const response = await fetch(src, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
    })().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      setObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [src]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-ink/10 text-xs text-ink/50 ${className ?? ""}`}>
        Clip stored (preview unavailable)
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={`bg-ink/10 ${className ?? ""}`} />;
  }

  return (
    <video
      src={objectUrl}
      controls
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
