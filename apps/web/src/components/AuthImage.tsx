"use client";

import { useEffect, useState } from "react";
import { getStoredSession } from "@/lib/api";

export function AuthImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session) return;
    const controller = new AbortController();
    (async () => {
      const response = await fetch(src, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
    })().catch(() => undefined);
    return () => {
      controller.abort();
      setObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [src]);

  if (!objectUrl) {
    return <div className={`bg-ink/10 ${className ?? ""}`} aria-label={alt} />;
  }

  return <img src={objectUrl} alt={alt} className={className} />;
}
