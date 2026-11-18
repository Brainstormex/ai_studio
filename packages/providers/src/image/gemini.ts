import { GoogleGenAI } from "@google/genai";
import type { ImageGenerateInput, ImageGenerateResult, ImageProvider } from "../types.js";

export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini-image";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.IMAGE_MODEL ?? "gemini-2.5-flash-image",
  ) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for GeminiImageProvider");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generate(input: ImageGenerateInput): Promise<ImageGenerateResult> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: input.prompt,
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: input.aspectRatio
          ? {
              aspectRatio: input.aspectRatio,
            }
          : undefined,
      },
    });

    const candidateParts = response.candidates?.[0]?.content?.parts ?? [];
    const topParts =
      typeof (response as { parts?: unknown }).parts !== "undefined"
        ? ((response as { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> }).parts ??
          [])
        : [];
    const parts = candidateParts.length ? candidateParts : topParts;

    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        return {
          imageBytes: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType || "image/png",
          model: this.model,
        };
      }
    }

    throw new Error("Gemini image generation returned no image data");
  }
}
