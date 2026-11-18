import { prisma } from "@studio/db";
import { generateStoryboard, patchProjectIfActive } from "@studio/pipeline";
import type { StoryboardGenerationJobData } from "@studio/shared";
import { QUEUE } from "@studio/shared";
import { createWorker } from "../queues.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startStoryboardGenerationWorker() {
  return createWorker(QUEUE.STORYBOARD_GENERATION, async (job, token) => {
    const skipped = await guardProjectJob(job, token);
    if (skipped) return skipped;

    const data = job.data as StoryboardGenerationJobData;
    console.log(`[storyboard-generation] start project=${data.projectId}`);

    await prisma.generationJob.update({
      where: { id: data.jobRecordId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const result = await generateStoryboard(data.projectId, data.regenerate ?? false, {
        episodeId: data.episodeId,
      });
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          result,
        },
      });
      console.log(
        `[storyboard-generation] success project=${data.projectId} shots=${result.createdShots}`,
      );
      return result;
    } catch (error) {
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Storyboard generation failed",
        },
      });
      await patchProjectIfActive(data.projectId, { status: "FAILED" });
      throw error;
    }
  });
}
