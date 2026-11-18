import { Queue } from "bullmq";
import { prisma } from "@studio/db";
import { assertBudgetAllowsVideoGeneration } from "@studio/pipeline";
import {
  DEFAULT_JOB_OPTIONS,
  PIPELINE_STAGE,
  QUEUE,
  type PipelineStage,
} from "@studio/shared";
import { redisConnection } from "../queues.js";
import { maybeEnqueueStoryboard } from "./enqueue-storyboard.js";
import { enqueueQualityControl } from "./enqueue-qc.js";

const storyQueue = new Queue(QUEUE.STORY_GENERATION, { connection: redisConnection });
const scriptQueue = new Queue(QUEUE.SCRIPT_ANALYSIS, { connection: redisConnection });
const characterQueue = new Queue(QUEUE.CHARACTER_GENERATION, { connection: redisConnection });
const environmentQueue = new Queue(QUEUE.ENVIRONMENT_GENERATION, { connection: redisConnection });
const videoQueue = new Queue(QUEUE.VIDEO_GENERATION, { connection: redisConnection });
const audioQueue = new Queue(QUEUE.AUDIO_GENERATION, { connection: redisConnection });
const renderQueue = new Queue(QUEUE.VIDEO_RENDERING, { connection: redisConnection });

async function createAndAdd(params: {
  projectId: string;
  userId: string;
  type:
    | "STORY_GENERATION"
    | "SCRIPT_ANALYSIS"
    | "CHARACTER_GENERATION"
    | "ENVIRONMENT_GENERATION"
    | "VIDEO_GENERATION"
    | "AUDIO_GENERATION"
    | "VIDEO_RENDERING";
  queue: Queue;
  name: string;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
}) {
  const jobKey = `${params.projectId}:${params.type.toLowerCase()}:${Date.now()}`;
  const jobRecord = await prisma.generationJob.create({
    data: {
      projectId: params.projectId,
      type: params.type,
      status: "QUEUED",
      jobKey,
      payload: (params.payload ?? {}) as object,
    },
  });

  const bullJob = await params.queue.add(
    params.name,
    {
      projectId: params.projectId,
      userId: params.userId,
      jobRecordId: jobRecord.id,
      ...(params.data ?? {}),
    },
    { jobId: jobKey, ...DEFAULT_JOB_OPTIONS },
  );

  await prisma.generationJob.update({
    where: { id: jobRecord.id },
    data: { bullJobId: String(bullJob.id) },
  });

  return { skipped: false, jobId: jobRecord.id, stageType: params.type };
}

export async function enqueuePipelineStage(params: {
  projectId: string;
  userId: string;
  stage: PipelineStage;
  forceTts?: boolean;
  regenerate?: boolean;
}) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: params.projectId },
  });

  if (params.stage === PIPELINE_STAGE.PLANNING) {
    if (project.mode === "SCRIPT_TO_VIDEO") {
      const script = await prisma.script.findFirst({
        where: { projectId: params.projectId },
        orderBy: { createdAt: "desc" },
      });
      if (!script) {
        return { skipped: true, reason: "no-script" };
      }
      return createAndAdd({
        projectId: params.projectId,
        userId: params.userId,
        type: "SCRIPT_ANALYSIS",
        queue: scriptQueue,
        name: "analyze-script",
        payload: { scriptId: script.id },
        data: { scriptId: script.id },
      });
    }
    return createAndAdd({
      projectId: params.projectId,
      userId: params.userId,
      type: "STORY_GENERATION",
      queue: storyQueue,
      name: "generate-story",
      payload: { regenerate: params.regenerate ?? false },
    });
  }

  if (params.stage === PIPELINE_STAGE.REFERENCES) {
    const [characters, environments] = await Promise.all([
      createAndAdd({
        projectId: params.projectId,
        userId: params.userId,
        type: "CHARACTER_GENERATION",
        queue: characterQueue,
        name: "generate-characters",
        payload: { regenerate: params.regenerate ?? false },
        data: { regenerate: params.regenerate ?? false },
      }),
      createAndAdd({
        projectId: params.projectId,
        userId: params.userId,
        type: "ENVIRONMENT_GENERATION",
        queue: environmentQueue,
        name: "generate-environments",
        payload: { regenerate: params.regenerate ?? false },
        data: { regenerate: params.regenerate ?? false },
      }),
    ]);
    return { skipped: false, characters, environments };
  }

  if (params.stage === PIPELINE_STAGE.STORYBOARD) {
    return maybeEnqueueStoryboard({
      projectId: params.projectId,
      userId: params.userId,
      regenerate: params.regenerate,
    });
  }

  if (params.stage === PIPELINE_STAGE.VIDEO) {
    await assertBudgetAllowsVideoGeneration(params.projectId);
    return createAndAdd({
      projectId: params.projectId,
      userId: params.userId,
      type: "VIDEO_GENERATION",
      queue: videoQueue,
      name: "generate-video",
      payload: { regenerate: params.regenerate ?? false },
      data: { regenerate: params.regenerate ?? false },
    });
  }

  if (params.stage === PIPELINE_STAGE.QUALITY_CONTROL) {
    return enqueueQualityControl({
      projectId: params.projectId,
      userId: params.userId,
      scope: "video",
    });
  }

  if (params.stage === PIPELINE_STAGE.AUDIO) {
    return createAndAdd({
      projectId: params.projectId,
      userId: params.userId,
      type: "AUDIO_GENERATION",
      queue: audioQueue,
      name: "generate-audio",
      payload: {
        regenerate: params.regenerate ?? false,
        forceTts: params.forceTts ?? false,
      },
      data: {
        regenerate: params.regenerate ?? false,
        forceTts: params.forceTts ?? false,
      },
    });
  }

  return createAndAdd({
    projectId: params.projectId,
    userId: params.userId,
    type: "VIDEO_RENDERING",
    queue: renderQueue,
    name: "render-video",
    payload: { includeTitles: true, burnSubtitles: true },
    data: { includeTitles: true, burnSubtitles: true },
  });
}
