import type {
  AudioProvider,
  AudioSynthesizeInput,
  AudioSynthesizeResult,
  AsyncJobHandle,
  ImageGenerateInput,
  ImageGenerateResult,
  ImageProvider,
  LlmGenerateInput,
  LlmGenerateResult,
  LlmProvider,
  VideoGenerateInput,
  VideoJobResult,
  VideoProvider,
  VideoRenderResult,
} from "./types.js";

export class NotImplementedVideoProvider implements VideoProvider {
  readonly name = "not-implemented-video";
  readonly supports = {
    referenceImages: true,
    extend: true,
    nativeAudio: true,
    maxDurationSec: 15,
    maxReferenceImages: 6,
  };

  async render(_input: VideoGenerateInput): Promise<VideoRenderResult> {
    throw new Error("Use createVideoProviderFromEnv() for video generation");
  }

  async generate(_input: VideoGenerateInput): Promise<AsyncJobHandle> {
    throw new Error("Use createVideoProviderFromEnv() for video generation");
  }

  async poll(_handle: AsyncJobHandle): Promise<VideoJobResult> {
    throw new Error("Use createVideoProviderFromEnv() for video generation");
  }
}

export class NotImplementedLlmProvider implements LlmProvider {
  readonly name = "not-implemented-llm";

  async generate(_input: LlmGenerateInput): Promise<LlmGenerateResult> {
    throw new Error("LLM provider is not enabled until Phase 2");
  }
}

export class NotImplementedImageProvider implements ImageProvider {
  readonly name = "not-implemented-image";

  async generate(_input: ImageGenerateInput): Promise<ImageGenerateResult> {
    throw new Error("Image provider is not enabled until Phase 3");
  }
}

export class NotImplementedAudioProvider implements AudioProvider {
  readonly name = "not-implemented-audio";

  async synthesize(_input: AudioSynthesizeInput): Promise<AudioSynthesizeResult> {
    throw new Error("Use createAudioProviderFromEnv() for audio synthesis");
  }
}
