import { Queue } from "bullmq";
import { prisma } from "@studio/db";
import { DEFAULT_JOB_OPTIONS, QUEUE } from "@studio/shared";
import { redisConnection } from "../queues.js";

const qcQueue = new Queue(QUEUE.QUALITY_CONTROL, { connection: redisConnection });

export async function enqueueQualityControl(params: {
  projectId: string;
  userId: string;
  scope?: "video" | "audio" | "all";
}) {
  const active = await prisma.generationJob.findFirst({
    where: {
      projectId: params.projectId,
      type: "QUALITY_CONTROL",
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (active) {
    return { skipped: true, jobId: active.id };
  }

  const scope = params.scope ?? "all";
  const jobKey = `${params.projectId}:qc:${scope}:${Date.now()}`;
  const jobRecord = await prisma.generationJob.create({
    data: {
      projectId: params.projectId,
      type: "QUALITY_CONTROL",
      status: "QUEUED",
      jobKey,
      payload: { scope },
    },
  });

  const bullJob = await qcQueue.add(
    "quality-control",
    {
      projectId: params.projectId,
      userId: params.userId,
      jobRecordId: jobRecord.id,
      scope,
    },
    { jobId: jobKey, ...DEFAULT_JOB_OPTIONS },
  );

  await prisma.generationJob.update({
    where: { id: jobRecord.id },
    data: { bullJobId: String(bullJob.id) },
  });

  return { skipped: false, jobId: jobRecord.id };
}
