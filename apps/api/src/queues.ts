import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE } from "@studio/shared";

const connection = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const storyQueue = new Queue(QUEUE.STORY_GENERATION, { connection });
export const scriptQueue = new Queue(QUEUE.SCRIPT_ANALYSIS, { connection });
export const characterQueue = new Queue(QUEUE.CHARACTER_GENERATION, { connection });
export const environmentQueue = new Queue(QUEUE.ENVIRONMENT_GENERATION, { connection });
export const storyboardQueue = new Queue(QUEUE.STORYBOARD_GENERATION, { connection });
export const videoQueue = new Queue(QUEUE.VIDEO_GENERATION, { connection });
export const videoExtensionQueue = new Queue(QUEUE.VIDEO_EXTENSION, { connection });
export const audioQueue = new Queue(QUEUE.AUDIO_GENERATION, { connection });
export const qcQueue = new Queue(QUEUE.QUALITY_CONTROL, { connection });
export const renderQueue = new Queue(QUEUE.VIDEO_RENDERING, { connection });
export const episodeContinuationQueue = new Queue(QUEUE.EPISODE_CONTINUATION, { connection });


