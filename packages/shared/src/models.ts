export const MODEL_IDS = {
  llmCheap: "gemini-2.5-flash",
  llmCreative: "gemini-2.5-pro",
  image: "gemini-2.5-flash-image",
  video: "gemini-omni-1.2-flash",
} as const;

export const VIDEO_PROVIDER_CAPS = {
  "google-omni": {
    minDurationSec: 3,
    maxDurationSec: 15,
    extendMaxDurationSec: 10,
    maxReferenceImages: 6,
    nativeAudio: true,
    resolutions: ["360p", "720p", "1080p", "4k"] as const,
    aspectRatios: ["16:9", "9:16"] as const,
  },
} as const;
