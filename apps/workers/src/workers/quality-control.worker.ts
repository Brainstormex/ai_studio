import { prisma } from "@studio/db";
import { runQualityControl } from "@studio/pipeline";
import type { QualityControlJobData } from "@studio/shared";
import { QUEUE, WORKER_CONCURRENCY } from "@studio/shared";
import { createWorker } from "../queues.js";
import { guardProjectJob } from "../services/project-guard.js";

export function startQualityControlWorker() {
  return createWorker(
    QUEUE.QUALITY_CONTROL,
    async (job, token) => {
      const skipped = await guardProjectJob(job, token);
      if (skipped) return skipped;

      const data = job.data as QualityControlJobData;
      console.log(`[quality-control] start project=${data.projectId} scope=${data.scope ?? "all"}`);

      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
      });

      try {
        const result = await runQualityControl({
          projectId: data.projectId,
          scope: data.scope ?? "all",
        });
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: result.passed ? "SUCCEEDED" : "FAILED",
            finishedAt: new Date(),
            result,
            errorMessage: result.passed
              ? null
              : `QC failed with ${result.issueCount} issue(s)`,
          },
        });
        console.log(
          `[quality-control] ${result.passed ? "pass" : "fail"} project=${data.projectId} issues=${result.issueCount}`,
        );
        return result;
      } catch (error) {
        await prisma.generationJob.update({
          where: { id: data.jobRecordId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : "Quality control failed",
          },
        });
        throw error;
      }
    },
    WORKER_CONCURRENCY.qc(),
  );
}
