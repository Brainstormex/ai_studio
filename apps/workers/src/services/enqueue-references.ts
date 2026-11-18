import { Queue } from "bullmq";
import { prisma } from "@studio/db";
import { QUEUE } from "@studio/shared";
import { redisConnection } from "../queues.js";

const characterQueue = new Queue(QUEUE.CHARACTER_GENERATION, { connection: redisConnection });
const environmentQueue = new Queue(QUEUE.ENVIRONMENT_GENERATION, {
  connection: redisConnection,
});

export async function enqueueReferenceGeneration(params: {
  projectId: string;
  userId: string;
  regenerate?: boolean;
  characterIds?: string[];
  environmentIds?: string[];
}) {
  const result: {
    characterJobId?: string;
    environmentJobId?: string;
  } = {};

  const shouldCharacters =
    params.characterIds === undefined || (params.characterIds?.length ?? 0) > 0;
  const shouldEnvironments =
    params.environmentIds === undefined || (params.environmentIds?.length ?? 0) > 0;

  if (shouldCharacters && (params.characterIds === undefined || params.characterIds.length > 0)) {
    const characterJobKey = `${params.projectId}:characters:${Date.now()}`;
    const characterJob = await prisma.generationJob.create({
      data: {
        projectId: params.projectId,
        type: "CHARACTER_GENERATION",
        status: "QUEUED",
        jobKey: characterJobKey,
        payload: {
          regenerate: params.regenerate ?? false,
          characterIds: params.characterIds ?? null,
        },
      },
    });

    const bullCharacter = await characterQueue.add(
      "generate-characters",
      {
        projectId: params.projectId,
        userId: params.userId,
        jobRecordId: characterJob.id,
        regenerate: params.regenerate ?? false,
        characterIds: params.characterIds,
      },
      { jobId: characterJobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: characterJob.id },
      data: { bullJobId: String(bullCharacter.id) },
    });
    result.characterJobId = characterJob.id;
  }

  if (
    shouldEnvironments &&
    (params.environmentIds === undefined || params.environmentIds.length > 0)
  ) {
    const environmentJobKey = `${params.projectId}:environments:${Date.now()}`;
    const environmentJob = await prisma.generationJob.create({
      data: {
        projectId: params.projectId,
        type: "ENVIRONMENT_GENERATION",
        status: "QUEUED",
        jobKey: environmentJobKey,
        payload: {
          regenerate: params.regenerate ?? false,
          environmentIds: params.environmentIds ?? null,
        },
      },
    });

    const bullEnvironment = await environmentQueue.add(
      "generate-environments",
      {
        projectId: params.projectId,
        userId: params.userId,
        jobRecordId: environmentJob.id,
        regenerate: params.regenerate ?? false,
        environmentIds: params.environmentIds,
      },
      { jobId: environmentJobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: environmentJob.id },
      data: { bullJobId: String(bullEnvironment.id) },
    });
    result.environmentJobId = environmentJob.id;
  }

  return result;
}
