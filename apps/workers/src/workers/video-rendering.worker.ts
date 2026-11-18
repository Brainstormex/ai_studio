import { prisma } from "@studio/db";
import { patchProjectIfActive, renderProjectVideo } from "@studio/pipeline";
import type { VideoRenderingJobData } from "@studio/shared";
import { QUEUE, WORKER_CONCURRENCY } from "@studio/shared";
import { createWorker } from "../queues.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startVideoRenderingWorker() {
  return createWorker(
    QUEUE.VIDEO_RENDERING,
    async (job, token) => {
      const skipped = await guardProjectJob(job, token);
      if (skipped) return skipped;

      const data = job.data as VideoRenderingJobData;
      console.log(`[video-rendering] start project=${data.projectId}`);

      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
      });

      try {
        const result = await renderProjectVideo({
          projectId: data.projectId,
          includeTitles: data.includeTitles ?? true,
          burnSubtitles: data.burnSubtitles ?? true,
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
          `[video-rendering] success project=${data.projectId} asset=${result.assetId}`,
        );
        return result;
      } catch (error) {
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Video rendering failed",
          },
        });
        await patchProjectIfActive(data.projectId, { status: "FAILED" });
        throw error;
      }
    },
    WORKER_CONCURRENCY.render(),
    { lockDuration: 900_000 },
  );
}
