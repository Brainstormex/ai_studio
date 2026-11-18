import type { LlmProvider } from "../types.js";
import { GeminiLlmProvider } from "./gemini.js";
import { MockLlmProvider } from "./mock.js";

export function createLlmProviderFromEnv(): LlmProvider {
  const driver = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  if (driver === "mock") {
    return new MockLlmProvider();
  }
  if (driver === "gemini") {
    return new GeminiLlmProvider();
  }
  if (process.env.GEMINI_API_KEY) {
    return new GeminiLlmProvider();
  }
  return new MockLlmProvider();
}
