import { prisma } from "@studio/db";
import { generateShotVideo } from "@studio/pipeline";
import type { VideoExtensionJobData } from "@studio/shared";
import { QUEUE, WORKER_CONCURRENCY } from "@studio/shared";
import { createWorker } from "../queues.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startVideoExtensionWorker() {
  return createWorker(
    QUEUE.VIDEO_EXTENSION,
    async (job, token) => {
      const skipped = await guardProjectJob(job, token);
      if (skipped) return skipped;

      const data = job.data as VideoExtensionJobData;
      console.log(`[video-extension] start project=${data.projectId} shot=${data.shotId}`);

      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
      });

      try {
        const result = await generateShotVideo({
          projectId: data.projectId,
          shotId: data.shotId,
          regenerate: data.regenerate ?? true,
        });
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            result,
          },
        });
        console.log(`[video-extension] success shot=${data.shotId}`);
        return result;
      } catch (error) {
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Video extension failed",
          },
        });
        throw error;
      }
    },
    WORKER_CONCURRENCY.videoExtension(),
    { lockDuration: 600_000 },
  );
}
