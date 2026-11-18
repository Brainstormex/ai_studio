import { GoogleGenAI } from "@google/genai";
import type {
  AsyncJobHandle,
  VideoGenerateInput,
  VideoJobResult,
  VideoProvider,
  VideoRenderResult,
} from "../types.js";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "video"; data: string; mime_type: string };

function resolutionLabel(value: VideoGenerateInput["resolution"]): string {
  if (value === "4k") return "4k";
  return value;
}

function extractVideo(interaction: {
  id?: string;
  output_video?: { data?: string; mime_type?: string; uri?: string };
  outputs?: Array<{ type?: string; data?: string; mime_type?: string; uri?: string }>;
  steps?: Array<{
    content?: Array<{ type?: string; data?: string; mime_type?: string; uri?: string }>;
  }>;
}): { data?: string; mimeType: string; uri?: string } | null {
  if (interaction.output_video?.data || interaction.output_video?.uri) {
    return {
      data: interaction.output_video.data,
      uri: interaction.output_video.uri,
      mimeType: interaction.output_video.mime_type ?? "video/mp4",
    };
  }

  const fromOutputs = interaction.outputs?.find((part) => part.type === "video");
  if (fromOutputs?.data || fromOutputs?.uri) {
    return {
      data: fromOutputs.data,
      uri: fromOutputs.uri,
      mimeType: fromOutputs.mime_type ?? "video/mp4",
    };
  }

  for (const step of interaction.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type === "video" && (part.data || part.uri)) {
        return {
          data: part.data,
          uri: part.uri,
          mimeType: part.mime_type ?? "video/mp4",
        };
      }
    }
  }

  return null;
}

export class GoogleOmniVideoProvider implements VideoProvider {
  readonly name = "google-omni";
  readonly supports = {
    referenceImages: true,
    extend: true,
    nativeAudio: true,
    maxDurationSec: 15,
    maxReferenceImages: 6,
  };

  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly cache = new Map<string, VideoJobResult>();

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.VIDEO_MODEL ?? "gemini-omni-1.2-flash",
  ) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is required for GoogleOmniVideoProvider");
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async render(input: VideoGenerateInput): Promise<VideoRenderResult> {
    const seconds = Math.max(3, Math.min(15, Math.round(input.durationSeconds)));
    const parts: ContentPart[] = [{ type: "text", text: input.prompt }];

    if (input.image?.data) {
      parts.push({
        type: "image",
        data: input.image.data.toString("base64"),
        mime_type: input.image.mimeType,
      });
    }

    if (input.lastFrame?.data) {
      parts.push({
        type: "image",
        data: input.lastFrame.data.toString("base64"),
        mime_type: input.lastFrame.mimeType,
      });
    }

    for (const image of input.referenceImages?.slice(0, 6) ?? []) {
      parts.push({
        type: "image",
        data: image.data.toString("base64"),
        mime_type: image.mimeType,
      });
    }

    if (input.video?.data) {
      parts.push({
        type: "video",
        data: input.video.data.toString("base64"),
        mime_type: input.video.mimeType,
      });
    }

    const task =
      input.task === "first_last_frame" ? "image_to_video" : (input.task ?? "text_to_video");

    const interaction = await this.client.interactions.create({
      model: this.model,
      input: parts.length === 1 ? input.prompt : parts,
      previous_interaction_id: input.previousInteractionId,
      response_format: {
        type: "video",
        duration: `${seconds}s`,
        aspect_ratio: input.aspectRatio,
        resolution: resolutionLabel(input.resolution),
        delivery: "inline",
      },
      generation_config: {
        video_config: {
          task,
        },
      },
    });

    const interactionId = interaction.id ?? `omni-${Date.now()}`;
    const video = extractVideo(interaction as never);
    if (!video) {
      throw new Error("Omni returned no video output");
    }

    let videoBytes: Buffer | undefined;
    if (video.data) {
      videoBytes = Buffer.from(video.data, "base64");
    } else if (video.uri) {
      const response = await fetch(video.uri);
      if (!response.ok) {
        throw new Error(`Failed to download Omni video uri (${response.status})`);
      }
      videoBytes = Buffer.from(await response.arrayBuffer());
    }

    if (!videoBytes) {
      throw new Error("Omni video payload was empty");
    }

    const result: VideoJobResult = {
      status: "succeeded",
      videoBytes,
      mimeType: video.mimeType,
      interactionId,
      durationSeconds: seconds,
      nativeAudio: true,
    };
    this.cache.set(interactionId, result);

    return {
      videoBytes,
      mimeType: video.mimeType,
      interactionId,
      durationSeconds: seconds,
      nativeAudio: true,
    };
  }

  async generate(input: VideoGenerateInput): Promise<AsyncJobHandle> {
    const rendered = await this.render(input);
    return {
      id: rendered.interactionId ?? `omni-${Date.now()}`,
      provider: this.name,
    };
  }

  async poll(handle: AsyncJobHandle): Promise<VideoJobResult> {
    const cached = this.cache.get(handle.id);
    if (cached) return cached;
    return {
      status: "failed",
      errorMessage: "Unknown Omni interaction handle",
    };
  }
}
