import { Queue } from "bullmq";
import { prisma } from "@studio/db";
import { QUEUE } from "@studio/shared";
import { redisConnection } from "../queues.js";

const storyboardQueue = new Queue(QUEUE.STORYBOARD_GENERATION, {
  connection: redisConnection,
});

export async function enqueueStoryboard(params: {
  projectId: string;
  userId: string;
  regenerate?: boolean;
  episodeId?: string;
}) {
  const jobKey = `${params.projectId}:storyboard:${Date.now()}`;
  const jobRecord = await prisma.generationJob.create({
    data: {
      projectId: params.projectId,
      type: "STORYBOARD_GENERATION",
      status: "QUEUED",
      jobKey,
      payload: {
        regenerate: params.regenerate ?? false,
        episodeId: params.episodeId ?? null,
      },
    },
  });

  const bullJob = await storyboardQueue.add(
    "generate-storyboard",
    {
      projectId: params.projectId,
      userId: params.userId,
      jobRecordId: jobRecord.id,
      regenerate: params.regenerate ?? false,
      episodeId: params.episodeId,
    },
    { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
  );

  await prisma.generationJob.update({
    where: { id: jobRecord.id },
    data: { bullJobId: String(bullJob.id) },
  });

  return { skipped: false as const, jobId: jobRecord.id };
}

export async function maybeEnqueueStoryboard(params: {
  projectId: string;
  userId: string;
  regenerate?: boolean;
  episodeId?: string;
}) {
  const active = await prisma.generationJob.findFirst({
    where: {
      projectId: params.projectId,
      type: "STORYBOARD_GENERATION",
      status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (active && !params.regenerate && !params.episodeId) {
    return { skipped: true, jobId: active.id };
  }

  const [characters, environments, scenes] = await Promise.all([
    prisma.character.findMany({
      where: { projectId: params.projectId },
      include: { references: true },
    }),
    prisma.environment.findMany({
      where: { projectId: params.projectId },
      include: { references: true },
    }),
    prisma.scene.count({
      where: params.episodeId
        ? { chapter: { episodeId: params.episodeId } }
        : { chapter: { episode: { projectId: params.projectId } } },
    }),
  ]);

  if (scenes === 0) {
    return { skipped: true, reason: "no-scenes" };
  }

  const charactersReady =
    characters.length === 0 ||
    characters.every((item) => item.references.some((ref) => ref.isPrimary));
  const environmentsReady =
    environments.length === 0 ||
    environments.every((item) => item.references.some((ref) => ref.isPrimary));

  if (!charactersReady || !environmentsReady) {
    return { skipped: true, reason: "refs-pending" };
  }

  return enqueueStoryboard(params);
}
