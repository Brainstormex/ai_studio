import type { ImageProvider } from "../types.js";
import { GeminiImageProvider } from "./gemini.js";
import { MockImageProvider } from "./mock.js";

export function createImageProviderFromEnv(): ImageProvider {
  const driver = (process.env.IMAGE_PROVIDER ?? process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  if (driver === "mock") {
    return new MockImageProvider();
  }
  if (driver === "gemini") {
    return new GeminiImageProvider();
  }
  if (process.env.GEMINI_API_KEY) {
    return new GeminiImageProvider();
  }
  return new MockImageProvider();
}
