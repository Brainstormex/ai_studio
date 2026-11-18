import { DelayedError, type Job } from "bullmq";
import { assertProjectRunnable, ProjectControlError } from "@studio/pipeline";

export async function guardProjectJob(job: Job, token?: string) {
  const projectId = (job.data as { projectId?: string })?.projectId;
  if (!projectId) return;

  try {
    await assertProjectRunnable(projectId);
  } catch (error) {
    if (error instanceof ProjectControlError && error.code === "PROJECT_PAUSED") {
      const delayMs = Number(process.env.PAUSE_RETRY_MS ?? 10_000);
      await job.moveToDelayed(Date.now() + delayMs, token);
      throw new DelayedError();
    }
    if (error instanceof ProjectControlError && error.code === "PROJECT_CANCELLED") {
      return { skipped: true, reason: "cancelled" };
    }
    throw error;
  }

  return null;
}
