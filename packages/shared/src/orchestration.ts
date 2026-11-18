export const PIPELINE_STAGE = {
  PLANNING: "planning",
  REFERENCES: "references",
  STORYBOARD: "storyboard",
  VIDEO: "video",
  QUALITY_CONTROL: "quality-control",
  AUDIO: "audio",
  RENDER: "render",
} as const;

export type PipelineStage = (typeof PIPELINE_STAGE)[keyof typeof PIPELINE_STAGE];

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  PIPELINE_STAGE.PLANNING,
  PIPELINE_STAGE.REFERENCES,
  PIPELINE_STAGE.STORYBOARD,
  PIPELINE_STAGE.VIDEO,
  PIPELINE_STAGE.QUALITY_CONTROL,
  PIPELINE_STAGE.AUDIO,
  PIPELINE_STAGE.RENDER,
];

export function concurrencyFromEnv(name: string, fallback: number): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const raw = env?.[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const WORKER_CONCURRENCY = {
  story: () => concurrencyFromEnv("STORY_CONCURRENCY", 2),
  script: () => concurrencyFromEnv("SCRIPT_CONCURRENCY", 2),
  character: () => concurrencyFromEnv("CHARACTER_CONCURRENCY", 2),
  environment: () => concurrencyFromEnv("ENVIRONMENT_CONCURRENCY", 2),
  storyboard: () => concurrencyFromEnv("STORYBOARD_CONCURRENCY", 2),
  video: () => concurrencyFromEnv("VIDEO_CONCURRENCY", 1),
  videoExtension: () => concurrencyFromEnv("VIDEO_EXTENSION_CONCURRENCY", 1),
  audio: () => concurrencyFromEnv("AUDIO_CONCURRENCY", 2),
  qc: () => concurrencyFromEnv("QC_CONCURRENCY", 2),
  render: () => concurrencyFromEnv("RENDER_CONCURRENCY", 1),
};

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000,
  },
  removeOnComplete: 100,
  removeOnFail: 100,
};
