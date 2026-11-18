import { prisma } from "@studio/db";
import { generateProjectAudio } from "@studio/pipeline";
import type { AudioGenerationJobData } from "@studio/shared";
import { QUEUE, WORKER_CONCURRENCY } from "@studio/shared";
import { createWorker } from "../queues.js";
import { enqueueQualityControl } from "../services/enqueue-qc.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startAudioGenerationWorker() {
  return createWorker(
    QUEUE.AUDIO_GENERATION,
    async (job, token) => {
      const skipped = await guardProjectJob(job, token);
      if (skipped) return skipped;

      const data = job.data as AudioGenerationJobData;
      console.log(`[audio-generation] start project=${data.projectId}`);

      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
      });

      try {
        const result = await generateProjectAudio({
          projectId: data.projectId,
          regenerate: data.regenerate ?? false,
          forceTts: data.forceTts ?? false,
          shotIds: data.shotIds,
        });
        const qc = await enqueueQualityControl({
          projectId: data.projectId,
          userId: data.userId,
          scope: "audio",
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
          `[audio-generation] success project=${data.projectId} processed=${result.processed} tts=${result.ttsCount}`,
        );
        return result;
      } catch (error) {
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Audio generation failed",
          },
        });
        throw error;
      }
    },
    WORKER_CONCURRENCY.audio(),
    { lockDuration: 300_000 },
  );
}
