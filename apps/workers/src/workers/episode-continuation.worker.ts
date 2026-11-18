import { prisma } from "@studio/db";
import { continueProjectEpisode, patchProjectIfActive } from "@studio/pipeline";
import type { EpisodeContinuationJobData } from "@studio/shared";
import { QUEUE } from "@studio/shared";
import { createWorker } from "../queues.js";
import { enqueueReferenceGeneration } from "../services/enqueue-references.js";
import { enqueueStoryboard } from "../services/enqueue-storyboard.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startEpisodeContinuationWorker() {
  return createWorker(QUEUE.EPISODE_CONTINUATION, async (job, token) => {
    const skipped = await guardProjectJob(job, token);
    if (skipped) return skipped;

    const data = job.data as EpisodeContinuationJobData;
    console.log(`[episode-continuation] start project=${data.projectId} job=${data.jobRecordId}`);

    await prisma.generationJob.update({
      where: { id: data.jobRecordId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const result = await continueProjectEpisode(data.projectId, {
        additionalSeconds: data.additionalSeconds,
        instruction: data.instruction,
      });

      let refs = null;
      if (result.newCharacterIds.length > 0 || result.newEnvironmentIds.length > 0) {
        refs = await enqueueReferenceGeneration({
          projectId: data.projectId,
          userId: data.userId,
          regenerate: false,
          characterIds: result.newCharacterIds,
          environmentIds: result.newEnvironmentIds,
        });
      }

      const storyboard = await enqueueStoryboard({
        projectId: data.projectId,
        userId: data.userId,
        regenerate: false,
        episodeId: result.episodeId,
      });

      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          result: {
            scriptId: result.script.id,
            episodeId: result.episodeId,
            episodeNumber: result.episodeNumber,
            beatSeconds: result.beatSeconds,
            newCharacterIds: result.newCharacterIds,
            newEnvironmentIds: result.newEnvironmentIds,
            refs,
            storyboard,
          },
        },
      });
      console.log(
        `[episode-continuation] success project=${data.projectId} episode=${result.episodeNumber}`,
      );
      return result;
    } catch (error) {
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Episode continuation failed",
        },
      });
      await patchProjectIfActive(data.projectId, { status: "FAILED" });
      throw error;
    }
  });
}
