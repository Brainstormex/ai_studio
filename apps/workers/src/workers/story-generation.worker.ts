import { prisma } from "@studio/db";
import { generateTopicScreenplay, patchProjectIfActive } from "@studio/pipeline";
import type { StoryGenerationJobData } from "@studio/shared";
import { QUEUE } from "@studio/shared";
import { createWorker } from "../queues.js";
import { enqueueReferenceGeneration } from "../services/enqueue-references.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startStoryGenerationWorker() {
  return createWorker(QUEUE.STORY_GENERATION, async (job, token) => {
    const skipped = await guardProjectJob(job, token);
    if (skipped) return skipped;

    const data = job.data as StoryGenerationJobData;
    console.log(`[story-generation] start project=${data.projectId} job=${data.jobRecordId}`);

    await prisma.generationJob.update({
      where: { id: data.jobRecordId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const result = await generateTopicScreenplay(data.projectId);
      const refs = await enqueueReferenceGeneration({
        projectId: data.projectId,
        userId: data.userId,
      });
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          result: {
            scriptId: result.script.id,
            episodeId: result.episodeId,
            beatSeconds: result.beatSeconds,
            ...refs,
          },
        },
      });
      console.log(`[story-generation] success project=${data.projectId}`);
      return result;
    } catch (error) {
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Story generation failed",
        },
      });
      await patchProjectIfActive(data.projectId, { status: "FAILED" });
      throw error;
    }
  });
}

