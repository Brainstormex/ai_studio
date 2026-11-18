import { prisma } from "@studio/db";
import { generateProjectVideos, patchProjectIfActive } from "@studio/pipeline";
import type { VideoGenerationJobData } from "@studio/shared";
import { QUEUE, WORKER_CONCURRENCY } from "@studio/shared";
import { createWorker } from "../queues.js";
import { enqueueQualityControl } from "../services/enqueue-qc.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startVideoGenerationWorker() {
  return createWorker(
    QUEUE.VIDEO_GENERATION,
    async (job, token) => {
      const skipped = await guardProjectJob(job, token);
      if (skipped) return skipped;

      const data = job.data as VideoGenerationJobData;
      console.log(`[video-generation] start project=${data.projectId}`);

      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
      });

      try {
        const result = await generateProjectVideos({
          projectId: data.projectId,
          regenerate: data.regenerate ?? false,
          shotIds: data.shotIds,
        });
        const qc = await enqueueQualityControl({
          projectId: data.projectId,
          userId: data.userId,
          scope: "video",
        });
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            result: { ...result, qc },
          },
        });
        console.log(
          `[video-generation] success project=${data.projectId} processed=${result.processed}`,
        );
        return result;
      } catch (error) {
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Video generation failed",
          },
        });
        await patchProjectIfActive(data.projectId, { status: "FAILED" });
        throw error;
      }
    },
    WORKER_CONCURRENCY.video(),
    { lockDuration: 600_000 },
  );
}
