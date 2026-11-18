import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { chirp3VoiceName, toBcp47 } from "@studio/shared";
import type {
  AudioProvider,
  AudioSynthesizeInput,
  AudioSynthesizeResult,
} from "../types.js";

export class GoogleCloudTtsProvider implements AudioProvider {
  readonly name = "google-cloud-tts";
  private readonly client: TextToSpeechClient;

  constructor() {
    this.client = new TextToSpeechClient(
      process.env.GOOGLE_CLOUD_PROJECT
        ? { projectId: process.env.GOOGLE_CLOUD_PROJECT }
        : undefined,
    );
  }

  async synthesize(input: AudioSynthesizeInput): Promise<AudioSynthesizeResult> {
    const languageCode = toBcp47(input.languageCode);
    const voiceName = input.voiceName || chirp3VoiceName(languageCode);

    const [response] = await this.client.synthesizeSpeech({
      input: { text: input.text },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: "MP3",
      },
    });

    const content = response.audioContent;
    if (!content) {
      throw new Error("Cloud TTS returned empty audio");
    }

    const audioBytes = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content as Uint8Array);

    return {
      audioBytes,
      mimeType: "audio/mpeg",
      provider: this.name,
    };
  }
}
