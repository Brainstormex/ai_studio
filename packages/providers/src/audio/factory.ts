import type { AudioProvider } from "../types.js";
import { GoogleCloudTtsProvider } from "./cloud-tts.js";
import { MockAudioProvider } from "./mock.js";

export function createAudioProviderFromEnv(): AudioProvider {
  const driver = (process.env.AUDIO_PROVIDER ?? process.env.TTS_PROVIDER ?? "auto").toLowerCase();

  if (driver === "mock") {
    return new MockAudioProvider();
  }
  if (driver === "cloud" || driver === "google-cloud-tts" || driver === "tts") {
    return new GoogleCloudTtsProvider();
  }

  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_CLOUD_PROJECT
  ) {
    return new GoogleCloudTtsProvider();
  }

  return new MockAudioProvider();
}
