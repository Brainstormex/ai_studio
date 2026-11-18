import { Queue } from "bullmq";
import { prisma } from "@studio/db";
import {
  assertBudgetAllowsVideoGeneration,
  cancelProject,
  getOrchestrationStatus,
  pauseProject,
  resolveNextStage,
  resumeProject,
} from "@studio/pipeline";
import {
  DEFAULT_JOB_OPTIONS,
  PIPELINE_STAGE,
  PIPELINE_STAGE_ORDER,
  QUEUE,
  type PipelineStage,
} from "@studio/shared";
import {
  audioQueue,
  characterQueue,
  environmentQueue,
  qcQueue,
  renderQueue,
  scriptQueue,
  storyboardQueue,
  storyQueue,
  videoQueue,
} from "../queues.js";

async function removeBullJobs(jobIds: string[]) {
  const queues = [
    storyQueue,
    scriptQueue,
    characterQueue,
    environmentQueue,
    storyboardQueue,
    videoQueue,
    audioQueue,
    qcQueue,
    renderQueue,
  ];
  let removed = 0;
  for (const jobId of jobIds) {
    for (const queue of queues) {
      const job = await queue.getJob(jobId);
      if (!job) continue;
      try {
        await job.remove();
        removed += 1;
      } catch {
        try {
          await job.discard();
          removed += 1;
        } catch {
          // Locked/active jobs are skipped; workers honor CANCELLED project status.
        }
      }
      break;
    }
  }
  return removed;
}

async function createJob(params: {
  projectId: string;
  userId: string;
  type:
    | "STORY_GENERATION"
    | "SCRIPT_ANALYSIS"
    | "CHARACTER_GENERATION"
    | "ENVIRONMENT_GENERATION"
    | "STORYBOARD_GENERATION"
    | "VIDEO_GENERATION"
    | "AUDIO_GENERATION"
    | "QUALITY_CONTROL"
    | "VIDEO_RENDERING";
  queue: Queue;
  name: string;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
}) {
  const active = await prisma.generationJob.findFirst({
    where: {
      projectId: params.projectId,
      type: params.type,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (active) {
    return { skipped: true, jobId: active.id, type: params.type };
  }

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

  return { skipped: false, jobId: jobRecord.id, type: params.type };
}

export async function enqueueStage(params: {
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
      if (!script) return { skipped: true, reason: "no-script" };
      return createJob({
        projectId: params.projectId,
        userId: params.userId,
        type: "SCRIPT_ANALYSIS",
        queue: scriptQueue,
        name: "analyze-script",
        payload: { scriptId: script.id },
        data: { scriptId: script.id },
      });
    }
    return createJob({
      projectId: params.projectId,
      userId: params.userId,
      type: "STORY_GENERATION",
      queue: storyQueue,
      name: "generate-story",
      payload: { regenerate: params.regenerate ?? false },
    });
  }

  if (params.stage === PIPELINE_STAGE.REFERENCES) {
    const characters = await createJob({
      projectId: params.projectId,
      userId: params.userId,
      type: "CHARACTER_GENERATION",
      queue: characterQueue,
      name: "generate-characters",
      data: { regenerate: params.regenerate ?? false },
    });
    const environments = await createJob({
      projectId: params.projectId,
      userId: params.userId,
      type: "ENVIRONMENT_GENERATION",
      queue: environmentQueue,
      name: "generate-environments",
      data: { regenerate: params.regenerate ?? false },
    });
    return { skipped: false, characters, environments };
  }

  if (params.stage === PIPELINE_STAGE.STORYBOARD) {
    return createJob({
      projectId: params.projectId,
      userId: params.userId,
      type: "STORYBOARD_GENERATION",
      queue: storyboardQueue,
      name: "generate-storyboard",
      data: { regenerate: params.regenerate ?? false },
    });
  }

  if (params.stage === PIPELINE_STAGE.VIDEO) {
    await assertBudgetAllowsVideoGeneration(params.projectId);
    return createJob({
      projectId: params.projectId,
      userId: params.userId,
      type: "VIDEO_GENERATION",
      queue: videoQueue,
      name: "generate-video",
      data: { regenerate: params.regenerate ?? false },
    });
  }

  if (params.stage === PIPELINE_STAGE.QUALITY_CONTROL) {
    return createJob({
      projectId: params.projectId,
      userId: params.userId,
      type: "QUALITY_CONTROL",
      queue: qcQueue,
      name: "quality-control",
      payload: { scope: "video" },
      data: { scope: "video" },
    });
  }

  if (params.stage === PIPELINE_STAGE.AUDIO) {
    return createJob({
      projectId: params.projectId,
      userId: params.userId,
      type: "AUDIO_GENERATION",
      queue: audioQueue,
      name: "generate-audio",
      payload: { forceTts: params.forceTts ?? false, regenerate: params.regenerate ?? false },
      data: { forceTts: params.forceTts ?? false, regenerate: params.regenerate ?? false },
    });
  }

  return createJob({
    projectId: params.projectId,
    userId: params.userId,
    type: "VIDEO_RENDERING",
    queue: renderQueue,
    name: "render-video",
    payload: { includeTitles: true, burnSubtitles: true },
    data: { includeTitles: true, burnSubtitles: true },
  });
}

export async function runOrchestration(params: {
  projectId: string;
  userId: string;
  through?: PipelineStage;
  forceTts?: boolean;
  regenerate?: boolean;
}) {
  const through = params.through ?? PIPELINE_STAGE.QUALITY_CONTROL;
  const throughIndex = PIPELINE_STAGE_ORDER.indexOf(through);
  const nextStage = await resolveNextStage(params.projectId);
  if (!nextStage) {
    return { done: true, nextStage: null, enqueued: null };
  }
  if (PIPELINE_STAGE_ORDER.indexOf(nextStage) > throughIndex) {
    return { done: true, nextStage, enqueued: null, stoppedAt: through };
  }

  await prisma.project.update({
    where: { id: params.projectId },
    data: { status: "GENERATING" },
  });

  const enqueued = await enqueueStage({
    projectId: params.projectId,
    userId: params.userId,
    stage: nextStage,
    forceTts: params.forceTts,
    regenerate: params.regenerate,
  });

  return { done: false, nextStage, enqueued };
}

export async function pauseGeneration(projectId: string) {
  const result = await pauseProject(projectId);
  const removed = await removeBullJobs(result.bullJobIds);
  return { ...result, removedBullJobs: removed };
}

export async function resumeGeneration(params: { projectId: string; userId: string }) {
  const result = await resumeProject(params.projectId);
  let enqueued = null;
  if (result.nextStage) {
    enqueued = await enqueueStage({
      projectId: params.projectId,
      userId: params.userId,
      stage: result.nextStage,
    });
  }
  return { ...result, enqueued };
}

export async function cancelGeneration(projectId: string) {
  const result = await cancelProject(projectId);
  const removed = await removeBullJobs(result.bullJobIds);
  return { ...result, removedBullJobs: removed };
}

export { getOrchestrationStatus };
