export const DEFAULT_PRICING = {
  version: "2026-11-omni",
  videoUsdPerSecond: {
    "360p": 0.023,
    "720p": 0.07,
    "1080p": 0.104,
    "4k": 0.209,
  },
  imageUsdPerImage: 0.039,
  llm: {
    "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
    "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  },
  ttsUsdPer1MChars: 16,
} as const;

export function estimateVideoCostUsd(
  durationSeconds: number,
  resolution: "360p" | "720p" | "1080p" | "4k" = "720p",
): number {
  return durationSeconds * DEFAULT_PRICING.videoUsdPerSecond[resolution];
}

export function estimateLlmCostUsd(
  model: keyof typeof DEFAULT_PRICING.llm,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = DEFAULT_PRICING.llm[model];
  return (inputTokens / 1_000_000) * rates.inputPer1M + (outputTokens / 1_000_000) * rates.outputPer1M;
}

export function estimateImageCostUsd(imageCount = 1): number {
  return imageCount * DEFAULT_PRICING.imageUsdPerImage;
}

export function estimateTtsCostUsd(charCount: number): number {
  return (charCount / 1_000_000) * DEFAULT_PRICING.ttsUsdPer1MChars;
}

