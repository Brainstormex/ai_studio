export type AsyncJobHandle = {
  id: string;
  provider: string;
};

export type MediaBytes = {
  data: Buffer;
  mimeType: string;
};

export type VideoGenerateInput = {
  prompt: string;
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16";
  resolution: "360p" | "720p" | "1080p" | "4k";
  task?:
    | "text_to_video"
    | "image_to_video"
    | "reference_to_video"
    | "first_last_frame"
    | "edit"
    | "extend";
  previousInteractionId?: string;
  image?: MediaBytes;
  lastFrame?: MediaBytes;
  referenceImages?: MediaBytes[];
  video?: MediaBytes;
  referenceImageUris?: string[];
  imageUri?: string;
  lastFrameUri?: string;
  videoUri?: string;
};

export type VideoJobResult = {
  status: "pending" | "running" | "succeeded" | "failed";
  videoUri?: string;
  videoBytes?: Buffer;
  mimeType?: string;
  interactionId?: string;
  errorMessage?: string;
  durationSeconds?: number;
  nativeAudio?: boolean;
};

export type VideoRenderResult = {
  videoBytes: Buffer;
  mimeType: string;
  interactionId?: string;
  durationSeconds: number;
  nativeAudio: boolean;
};

export interface VideoProvider {
  readonly name: string;
  readonly supports: {
    referenceImages: boolean;
    extend: boolean;
    nativeAudio: boolean;
    maxDurationSec: number;
    maxReferenceImages: number;
  };
  render(input: VideoGenerateInput): Promise<VideoRenderResult>;
  generate(input: VideoGenerateInput): Promise<AsyncJobHandle>;
  poll(handle: AsyncJobHandle): Promise<VideoJobResult>;
}

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmGenerateInput = {
  model: string;
  messages: LlmMessage[];
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
};

export type LlmGenerateResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export interface LlmProvider {
  readonly name: string;
  generate(input: LlmGenerateInput): Promise<LlmGenerateResult>;
}

export type ImageGenerateInput = {
  prompt: string;
  aspectRatio?: string;
  referenceImageUris?: string[];
};

export type ImageGenerateResult = {
  imageBytes: Buffer;
  mimeType: string;
  model: string;
};

export interface ImageProvider {
  readonly name: string;
  generate(input: ImageGenerateInput): Promise<ImageGenerateResult>;
}

export type AudioSynthesizeInput = {
  text: string;
  languageCode: string;
  voiceName?: string;
};

export type AudioSynthesizeResult = {
  audioBytes: Buffer;
  mimeType: string;
  provider: string;
};

export interface AudioProvider {
  readonly name: string;
  synthesize(input: AudioSynthesizeInput): Promise<AudioSynthesizeResult>;
}

export type PutObjectInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  bucket?: string;
};

export type ObjectInfo = {
  bucket: string;
  key: string;
  url: string;
};

export type GetObjectResult = {
  body: Buffer;
  contentType?: string;
};

export interface ObjectStorage {
  ensureBucket(bucket?: string): Promise<void>;
  putObject(input: PutObjectInput): Promise<ObjectInfo>;
  getObject(key: string, bucket?: string): Promise<GetObjectResult>;
  getSignedUrl(key: string, expiresInSeconds?: number, bucket?: string): Promise<string>;
  exists(key: string, bucket?: string): Promise<boolean>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}
