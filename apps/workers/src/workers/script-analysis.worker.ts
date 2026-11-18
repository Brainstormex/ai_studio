import { prisma } from "@studio/db";
import { analyzeScriptToScreenplay } from "@studio/pipeline";
import type { ScriptAnalysisJobData } from "@studio/shared";
import { QUEUE } from "@studio/shared";
import { createWorker } from "../queues.js";
import { enqueueReferenceGeneration } from "../services/enqueue-references.js";

export function startScriptAnalysisWorker() {
  return createWorker(QUEUE.SCRIPT_ANALYSIS, async (job) => {
    const data = job.data as ScriptAnalysisJobData;
    console.log(`[script-analysis] start project=${data.projectId} script=${data.scriptId}`);

    await prisma.generationJob.update({
      where: { id: data.jobRecordId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const script = await prisma.script.findUniqueOrThrow({ where: { id: data.scriptId } });
      const result = await analyzeScriptToScreenplay(
        data.projectId,
        script.rawText,
        script.sourceType,
        script.id,
      );
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
      console.log(`[script-analysis] success project=${data.projectId}`);
      return result;
    } catch (error) {
      await prisma.generationJob.update({
        where: { id: data.jobRecordId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Script analysis failed",
        },
      });
      await prisma.project.update({
        where: { id: data.projectId },
        data: { status: "FAILED" },
      });
      throw error;
    }
  });
}

