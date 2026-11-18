import { prisma } from "@studio/db";
import { generateEnvironmentReferences, markReferencesProgress } from "@studio/pipeline";
import type { EnvironmentGenerationJobData } from "@studio/shared";
import { QUEUE } from "@studio/shared";
import { createWorker } from "../queues.js";
import { maybeEnqueueStoryboard } from "../services/enqueue-storyboard.js";

export function startEnvironmentGenerationWorker() {
  return createWorker(QUEUE.ENVIRONMENT_GENERATION, async (job) => {
    const data = job.data as EnvironmentGenerationJobData;
    console.log(`[environment-generation] start project=${data.projectId}`);

    await prisma.generationJob.update({
      where: { id: data.jobRecordId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const result = await generateEnvironmentReferences({
        projectId: data.projectId,
        environmentIds: data.environmentIds,
        regenerate: data.regenerate,
      });
      const progress = await markReferencesProgress(data.projectId);
      let storyboard = null;
      if (progress.charactersReady && progress.environmentsReady) {
        storyboard = await maybeEnqueueStoryboard({
          projectId: data.projectId,
          userId: data.userId,
        });
      }
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          result: { ...result, storyboard },
        },
      });
      console.log(
        `[environment-generation] success project=${data.projectId} created=${result.created.length}`,
      );
      return result;
    } catch (error) {
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Environment generation failed",
        },
      });
      throw error;
    }
  });
}

