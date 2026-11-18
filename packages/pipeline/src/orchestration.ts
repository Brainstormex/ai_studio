import { prisma, type JobType, type ProjectStatus } from "@studio/db";
import {
  PIPELINE_STAGE,
  PIPELINE_STAGE_ORDER,
  type PipelineStage,
} from "@studio/shared";

export class ProjectControlError extends Error {
  readonly code: "PROJECT_PAUSED" | "PROJECT_CANCELLED" | "PROJECT_NOT_RUNNABLE";

  constructor(code: ProjectControlError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function assertProjectRunnable(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status === "PAUSED") {
    throw new ProjectControlError("PROJECT_PAUSED", "Project is paused");
  }
  if (project.status === "CANCELLED") {
    throw new ProjectControlError("PROJECT_CANCELLED", "Project is cancelled");
  }
  return project;
}

export async function patchProjectIfActive(
  projectId: string,
  data: {
    status?: ProjectStatus;
    progressPercent?: number;
    title?: string;
    storySummary?: string | null;
    artDirection?: string | null;
    targetDurationSeconds?: number;
    estimatedCostUsd?: number;
  },
) {
  return prisma.project.updateMany({
    where: {
      id: projectId,
      status: { notIn: ["CANCELLED", "PAUSED"] },
    },
    data,
  });
}

function latestJobStatus(
  jobs: Array<{ type: JobType; status: string }>,
  type: JobType,
): string {
  return jobs.find((job) => job.type === type)?.status ?? "NOT_STARTED";
}

export async function getOrchestrationStatus(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const jobs = await prisma.generationJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const shotCount = await prisma.shot.count({
    where: { scene: { chapter: { episode: { projectId } } } },
  });
  const videoSucceeded = await prisma.shot.count({
    where: {
      status: "SUCCEEDED",
      scene: { chapter: { episode: { projectId } } },
    },
  });
  const audioSucceeded = await prisma.audioSegment.count({
    where: {
      status: "SUCCEEDED",
      shot: { scene: { chapter: { episode: { projectId } } } },
    },
  });
  const characterCount = await prisma.character.count({ where: { projectId } });
  const charactersReady = await prisma.character.count({
    where: { projectId, references: { some: { isPrimary: true } } },
  });
  const environmentCount = await prisma.environment.count({ where: { projectId } });
  const environmentsReady = await prisma.environment.count({
    where: { projectId, references: { some: { isPrimary: true } } },
  });

  const planningStatus =
    project.mode === "SCRIPT_TO_VIDEO"
      ? latestJobStatus(jobs, "SCRIPT_ANALYSIS")
      : latestJobStatus(jobs, "STORY_GENERATION");

  const referencesReady =
    (characterCount === 0 || charactersReady === characterCount) &&
    (environmentCount === 0 || environmentsReady === environmentCount);

  const qcJob = jobs.find((job) => job.type === "QUALITY_CONTROL");
  const qcPassed =
    qcJob?.status === "SUCCEEDED" &&
    Boolean((qcJob.result as { passed?: boolean } | null)?.passed);
  const latestRender = await prisma.renderJob.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  const stages = PIPELINE_STAGE_ORDER.map((stage) => {
    if (stage === PIPELINE_STAGE.PLANNING) {
      return {
        id: stage,
        status: planningStatus,
        complete: planningStatus === "SUCCEEDED",
      };
    }
    if (stage === PIPELINE_STAGE.REFERENCES) {
      const charStatus = latestJobStatus(jobs, "CHARACTER_GENERATION");
      const envStatus = latestJobStatus(jobs, "ENVIRONMENT_GENERATION");
      const running = [charStatus, envStatus].some((s) => s === "QUEUED" || s === "RUNNING");
      const failed = [charStatus, envStatus].some((s) => s === "FAILED");
      return {
        id: stage,
        status: failed ? "FAILED" : running ? "RUNNING" : referencesReady ? "SUCCEEDED" : "PENDING",
        complete: referencesReady,
        detail: {
          charactersReady,
          characterCount,
          environmentsReady,
          environmentCount,
        },
      };
    }
    if (stage === PIPELINE_STAGE.STORYBOARD) {
      const status = latestJobStatus(jobs, "STORYBOARD_GENERATION");
      return {
        id: stage,
        status: shotCount > 0 && status !== "FAILED" ? "SUCCEEDED" : status,
        complete: shotCount > 0,
        detail: { shotCount },
      };
    }
    if (stage === PIPELINE_STAGE.VIDEO) {
      const status = latestJobStatus(jobs, "VIDEO_GENERATION");
      const complete = shotCount > 0 && videoSucceeded === shotCount;
      return {
        id: stage,
        status: complete ? "SUCCEEDED" : status,
        complete,
        detail: { videoSucceeded, shotCount },
      };
    }
    if (stage === PIPELINE_STAGE.QUALITY_CONTROL) {
      return {
        id: stage,
        status: qcJob?.status ?? "NOT_STARTED",
        complete: Boolean(qcPassed),
        detail: qcJob?.result ?? null,
      };
    }
    if (stage === PIPELINE_STAGE.AUDIO) {
      const audioStatus = latestJobStatus(jobs, "AUDIO_GENERATION");
      const complete = shotCount > 0 && audioSucceeded >= shotCount;
      return {
        id: stage,
        status: complete ? "SUCCEEDED" : audioStatus,
        complete,
        detail: { audioSucceeded, shotCount },
      };
    }

    const renderStatus = latestJobStatus(jobs, "VIDEO_RENDERING");
    const renderComplete = latestRender?.status === "SUCCEEDED" || project.status === "COMPLETED";
    return {
      id: stage,
      status: renderComplete ? "SUCCEEDED" : renderStatus,
      complete: renderComplete,
      detail: {
        renderJobId: latestRender?.id ?? null,
        outputAssetId: latestRender?.outputAssetId ?? null,
      },
    };
  });

  const nextStage =
    stages.find((stage) => !stage.complete)?.id ?? null;

  return {
    projectId,
    projectStatus: project.status,
    progressPercent: project.progressPercent,
    nextStage,
    stages,
    activeJobs: jobs.filter((job) => job.status === "QUEUED" || job.status === "RUNNING"),
  };
}

export async function resolveNextStage(projectId: string): Promise<PipelineStage | null> {
  const status = await getOrchestrationStatus(projectId);
  return status.nextStage;
}

export async function pauseProject(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status === "CANCELLED") {
    throw new ProjectControlError("PROJECT_CANCELLED", "Cancelled projects cannot be paused");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "PAUSED" },
  });

  const queued = await prisma.generationJob.findMany({
    where: { projectId, status: { in: ["QUEUED", "RUNNING"] } },
  });

  await prisma.generationJob.updateMany({
    where: {
      projectId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    data: {
      status: "CANCELLED",
      finishedAt: new Date(),
      errorMessage: "Paused by user",
    },
  });

  return {
    projectId,
    status: "PAUSED" as ProjectStatus,
    queuedJobIds: queued.map((job) => job.id),
    bullJobIds: queued.map((job) => job.bullJobId).filter(Boolean) as string[],
  };
}

export async function resumeProject(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.status === "CANCELLED") {
    throw new ProjectControlError("PROJECT_CANCELLED", "Cancelled projects cannot be resumed");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "GENERATING" },
  });

  const nextStage = await resolveNextStage(projectId);
  return {
    projectId,
    status: "GENERATING" as ProjectStatus,
    nextStage,
  };
}

export async function cancelProject(projectId: string) {
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "CANCELLED" },
  });

  const active = await prisma.generationJob.findMany({
    where: {
      projectId,
      status: { in: ["PENDING", "QUEUED", "RUNNING"] },
    },
  });

  await prisma.generationJob.updateMany({
    where: {
      projectId,
      status: { in: ["PENDING", "QUEUED", "RUNNING"] },
    },
    data: {
      status: "CANCELLED",
      finishedAt: new Date(),
      errorMessage: "Cancelled by user",
    },
  });

  await prisma.shot.updateMany({
    where: {
      status: { in: ["PENDING", "QUEUED", "GENERATING"] },
      scene: { chapter: { episode: { projectId } } },
    },
    data: { status: "CANCELLED" },
  });

  await prisma.videoSegment.updateMany({
    where: {
      status: { in: ["PENDING", "QUEUED", "GENERATING"] },
      shot: { scene: { chapter: { episode: { projectId } } } },
    },
    data: { status: "CANCELLED", errorMessage: "Cancelled by user" },
  });

  await prisma.audioSegment.updateMany({
    where: {
      status: { in: ["PENDING", "QUEUED", "GENERATING"] },
      shot: { scene: { chapter: { episode: { projectId } } } },
    },
    data: { status: "CANCELLED", errorMessage: "Cancelled by user" },
  });

  return {
    projectId,
    status: "CANCELLED" as ProjectStatus,
    cancelledJobs: active.length,
    bullJobIds: active.map((job) => job.bullJobId).filter(Boolean) as string[],
  };
}
