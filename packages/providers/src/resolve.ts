export type ResolvedProviderMode = "mock" | "live";

export function resolveProviderModes() {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasTts = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      process.env.GOOGLE_CLOUD_PROJECT?.trim(),
  );

  const llmDriver = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  const imageDriver = (process.env.IMAGE_PROVIDER ?? process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  const videoDriver = (
    process.env.VIDEO_PROVIDER ??
    process.env.LLM_PROVIDER ??
    "auto"
  ).toLowerCase();
  const audioDriver = (
    process.env.AUDIO_PROVIDER ??
    process.env.TTS_PROVIDER ??
    "auto"
  ).toLowerCase();

  const llm: ResolvedProviderMode =
    llmDriver === "mock" ? "mock" : llmDriver === "gemini" || (llmDriver === "auto" && hasGemini)
      ? "live"
      : "mock";
  const image: ResolvedProviderMode =
    imageDriver === "mock"
      ? "mock"
      : imageDriver === "gemini" || (imageDriver === "auto" && hasGemini)
        ? "live"
        : "mock";
  const video: ResolvedProviderMode =
    videoDriver === "mock"
      ? "mock"
      : ["omni", "google-omni", "gemini"].includes(videoDriver) ||
          (videoDriver === "auto" && hasGemini)
        ? "live"
        : "mock";
  const audio: ResolvedProviderMode =
    audioDriver === "mock"
      ? "mock"
      : ["cloud", "google-cloud-tts", "tts"].includes(audioDriver) ||
          (audioDriver === "auto" && hasTts)
        ? "live"
        : "mock";

  return {
    llm,
    image,
    video,
    audio,
    hasGeminiKey: hasGemini,
    hasCloudTtsCredentials: hasTts,
  };
}
