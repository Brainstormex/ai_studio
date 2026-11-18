import { Router } from "express";
import { prisma } from "@studio/db";
import { createStorageFromEnv, resolveProviderModes } from "@studio/providers";
import { WORKER_CONCURRENCY } from "@studio/shared";

export const healthRouter: Router = Router();

healthRouter.get("/", async (_req, res) => {
  const checks: Record<string, { ok: boolean; message: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, message: "connected" };
  } catch (error) {
    checks.database = {
      ok: false,
      message: error instanceof Error ? error.message : "database unavailable",
    };
  }

  try {
    const storage = createStorageFromEnv();
    checks.storage = await storage.healthCheck();
  } catch (error) {
    checks.storage = {
      ok: false,
      message: error instanceof Error ? error.message : "storage unavailable",
    };
  }

  const redisUrl = process.env.REDIS_URL;
  checks.redis = redisUrl
    ? { ok: true, message: `configured (${redisUrl})` }
    : { ok: false, message: "REDIS_URL not set" };

  const providers = resolveProviderModes();
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const weakJwt =
    !process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET.includes("change-me") ||
    !process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_REFRESH_SECRET.includes("change-me");

  checks.secrets = {
    ok: nodeEnv !== "production" || !weakJwt,
    message:
      nodeEnv === "production" && weakJwt
        ? "JWT secrets must be rotated for production"
        : weakJwt
          ? "using development JWT secrets"
          : "jwt secrets configured",
  };

  const ok = Object.values(checks).every((c) => c.ok);
  res.status(ok ? 200 : 503).json({
    ok,
    service: "ai-video-studio-api",
    phase: 10,
    videoGenerationEnabled: true,
    audioGenerationEnabled: true,
    orchestrationEnabled: true,
    renderEnabled: true,
    timelineEnabled: true,
    costsEnabled: true,
    continueEpisodeEnabled: true,
    budgetEnforcementEnabled: true,
    e2eReady: true,
    llmProvider: process.env.LLM_PROVIDER ?? (providers.hasGeminiKey ? "gemini" : "mock"),
    imageProvider:
      process.env.IMAGE_PROVIDER ??
      process.env.LLM_PROVIDER ??
      (providers.hasGeminiKey ? "gemini" : "mock"),
    videoProvider:
      process.env.VIDEO_PROVIDER ??
      process.env.LLM_PROVIDER ??
      (providers.hasGeminiKey ? "google-omni" : "mock"),
    audioProvider:
      process.env.AUDIO_PROVIDER ??
      process.env.TTS_PROVIDER ??
      (providers.hasCloudTtsCredentials ? "google-cloud-tts" : "mock"),
    providerModes: providers,
    concurrency: {
      video: WORKER_CONCURRENCY.video(),
      audio: WORKER_CONCURRENCY.audio(),
      qc: WORKER_CONCURRENCY.qc(),
      render: WORKER_CONCURRENCY.render(),
    },
    checks,
  });
});
