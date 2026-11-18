import type {
  AsyncJobHandle,
  VideoGenerateInput,
  VideoJobResult,
  VideoProvider,
  VideoRenderResult,
} from "../types.js";

function createMockMp4(prompt: string, durationSeconds: number): Buffer {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x01,
    0x69, 0x73, 0x6f, 0x6d, 0x61, 0x76, 0x63, 0x31,
  ]);
  const meta = Buffer.from(
    JSON.stringify({
      mock: true,
      prompt: prompt.slice(0, 120),
      durationSeconds,
      generatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  const mdatSize = Buffer.alloc(4);
  mdatSize.writeUInt32BE(8 + meta.length, 0);
  const mdat = Buffer.concat([mdatSize, Buffer.from("mdat"), meta]);
  return Buffer.concat([ftyp, mdat]);
}

export class MockVideoProvider implements VideoProvider {
  readonly name = "mock-video";
  readonly supports = {
    referenceImages: true,
    extend: true,
    nativeAudio: true,
    maxDurationSec: 15,
    maxReferenceImages: 6,
  };

  private readonly cache = new Map<string, VideoJobResult>();

  async render(input: VideoGenerateInput): Promise<VideoRenderResult> {
    const seconds = Math.max(3, Math.min(15, Math.round(input.durationSeconds)));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const interactionId = `mock-interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const videoBytes = createMockMp4(
      `${input.task ?? "text_to_video"}:${input.prompt}`,
      seconds,
    );

    const result: VideoJobResult = {
      status: "succeeded",
      videoBytes,
      mimeType: "video/mp4",
      interactionId,
      durationSeconds: seconds,
      nativeAudio: true,
    };
    this.cache.set(interactionId, result);

    return {
      videoBytes,
      mimeType: "video/mp4",
      interactionId,
      durationSeconds: seconds,
      nativeAudio: true,
    };
  }

  async generate(input: VideoGenerateInput): Promise<AsyncJobHandle> {
    const rendered = await this.render(input);
    return {
      id: rendered.interactionId ?? `mock-${Date.now()}`,
      provider: this.name,
    };
  }

  async poll(handle: AsyncJobHandle): Promise<VideoJobResult> {
    const cached = this.cache.get(handle.id);
    if (cached) return cached;
    return {
      status: "failed",
      errorMessage: "Unknown mock video handle",
    };
  }
}
