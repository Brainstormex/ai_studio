import type { VideoProvider } from "../types.js";
import { GoogleOmniVideoProvider } from "./omni.js";
import { MockVideoProvider } from "./mock.js";

export function createVideoProviderFromEnv(): VideoProvider {
  const driver = (
    process.env.VIDEO_PROVIDER ??
    process.env.LLM_PROVIDER ??
    "auto"
  ).toLowerCase();

  if (driver === "mock") {
    return new MockVideoProvider();
  }
  if (driver === "omni" || driver === "google-omni" || driver === "gemini") {
    return new GoogleOmniVideoProvider();
  }
  if (process.env.GEMINI_API_KEY) {
    return new GoogleOmniVideoProvider();
  }
  return new MockVideoProvider();
}
