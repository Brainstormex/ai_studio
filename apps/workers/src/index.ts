import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUEUE, WORKER_CONCURRENCY } from "@studio/shared";
import { ALL_QUEUES, createQueue, createWorker } from "./queues.js";
import { startStoryGenerationWorker } from "./workers/story-generation.worker.js";
import { startScriptAnalysisWorker } from "./workers/script-analysis.worker.js";
import { startCharacterGenerationWorker } from "./workers/character-generation.worker.js";
import { startEnvironmentGenerationWorker } from "./workers/environment-generation.worker.js";
import { startStoryboardGenerationWorker } from "./workers/storyboard-generation.worker.js";
import { startVideoGenerationWorker } from "./workers/video-generation.worker.js";
import { startVideoExtensionWorker } from "./workers/video-extension.worker.js";
import { startAudioGenerationWorker } from "./workers/audio-generation.worker.js";
import { startQualityControlWorker } from "./workers/quality-control.worker.js";
import { startVideoRenderingWorker } from "./workers/video-rendering.worker.js";
import { startEpisodeContinuationWorker } from "./workers/episode-continuation.worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const ACTIVE: string[] = [
  QUEUE.STORY_GENERATION,
  QUEUE.SCRIPT_ANALYSIS,
  QUEUE.CHARACTER_GENERATION,
  QUEUE.ENVIRONMENT_GENERATION,
  QUEUE.STORYBOARD_GENERATION,
  QUEUE.VIDEO_GENERATION,
  QUEUE.VIDEO_EXTENSION,
  QUEUE.AUDIO_GENERATION,
  QUEUE.QUALITY_CONTROL,
  QUEUE.VIDEO_RENDERING,
  QUEUE.EPISODE_CONTINUATION,
];

async function main() {
  for (const name of ALL_QUEUES) {
    createQueue(name);
  }

  startStoryGenerationWorker();
  startScriptAnalysisWorker();
  startCharacterGenerationWorker();
  startEnvironmentGenerationWorker();
  startStoryboardGenerationWorker();
  startVideoGenerationWorker();
  startVideoExtensionWorker();
  startAudioGenerationWorker();
  startQualityControlWorker();
  startVideoRenderingWorker();
  startEpisodeContinuationWorker();

  for (const name of ALL_QUEUES.filter((queue) => !ACTIVE.includes(queue))) {
    createWorker(name, async (job) => {
      console.log(`[${name}] received job ${job.id} (deferred to later phase)`);
      return { deferred: true, phase: 10 };
    });
  }

  console.log("Workers online (Phase 10). Active:");
  for (const name of ACTIVE) {
    console.log(` - ${name}`);
  }
  console.log("Concurrency:", {
    video: WORKER_CONCURRENCY.video(),
    audio: WORKER_CONCURRENCY.audio(),
    qc: WORKER_CONCURRENCY.qc(),
    render: WORKER_CONCURRENCY.render(),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
