import { GoogleGenAI } from "@google/genai";
import type { LlmGenerateInput, LlmGenerateResult, LlmProvider } from "../types.js";

export class GeminiLlmProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for GeminiLlmProvider");
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const system = input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const contents = input.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const response = await this.client.models.generateContent({
      model: input.model,
      contents,
      config: {
        systemInstruction: system || undefined,
        temperature: input.temperature ?? 0.7,
        maxOutputTokens: input.maxOutputTokens ?? 8192,
        responseMimeType: input.jsonSchema ? "application/json" : undefined,
        responseJsonSchema: input.jsonSchema,
      },
    });

    const text = response.text ?? "";
    const usage = response.usageMetadata;

    return {
      text,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? usage?.totalTokenCount ?? 0,
      model: input.model,
    };
  }
}
