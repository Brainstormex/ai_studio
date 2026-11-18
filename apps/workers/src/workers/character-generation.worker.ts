import { prisma } from "@studio/db";
import { generateCharacterReferences, markReferencesProgress } from "@studio/pipeline";
import type { CharacterGenerationJobData } from "@studio/shared";
import { QUEUE } from "@studio/shared";
import { createWorker } from "../queues.js";
import { maybeEnqueueStoryboard } from "../services/enqueue-storyboard.js";

export function startCharacterGenerationWorker() {
  return createWorker(QUEUE.CHARACTER_GENERATION, async (job) => {
    const data = job.data as CharacterGenerationJobData;
    console.log(`[character-generation] start project=${data.projectId}`);

    await prisma.generationJob.update({
      where: { id: data.jobRecordId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const result = await generateCharacterReferences({
        projectId: data.projectId,
        characterIds: data.characterIds,
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
        `[character-generation] success project=${data.projectId} created=${result.created.length}`,
      );
      return result;
    } catch (error) {
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Character generation failed",
        },
      });
      throw error;
    }
  });
}

