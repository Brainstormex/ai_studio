import { Router } from "express";
import { prisma } from "@studio/db";
import { assertBudgetAllows } from "@studio/pipeline";
import { QUEUE, continueEpisodeSchema, estimateVideoCostUsd } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { episodeContinuationQueue } from "../queues.js";
import { publishProjectEvent } from "./sse.routes.js";

export const episodesRouter: Router = Router({ mergeParams: true });

episodesRouter.use(requireAuth);

function projectIdFrom(req: { params: Record<string, string | string[] | undefined> }): string {
  return String(req.params.id);
}

async function assertProjectOwnership(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }
  return project;
}

episodesRouter.post("/continue", validateBody(continueEpisodeSchema), async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    const project = await assertProjectOwnership(req.user!.userId, projectId);

    const episodeCount = await prisma.episode.count({ where: { projectId } });
    if (episodeCount < 1) {
      res.status(400).json({ error: "Generate an initial screenplay before continuing" });
      return;
    }

    const active = await prisma.generationJob.findFirst({
      where: {
        projectId,
        type: "EPISODE_CONTINUATION",
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });
    if (active) {
      res.status(409).json({ error: "Episode continuation already in progress", job: active });
      return;
    }

    const additionalSeconds = req.body.additionalSeconds ?? 120;
    const instruction =
      typeof req.body.instruction === "string" && req.body.instruction.trim()
        ? req.body.instruction.trim()
        : undefined;

    const resolutionKey =
      project.resolution === "P1080"
        ? "1080p"
        : project.resolution === "P4K"
          ? "4k"
          : "720p";
    await assertBudgetAllows(projectId, {
      additionalUsd: estimateVideoCostUsd(additionalSeconds, resolutionKey),
      label: "episode continuation",
    });

    const jobKey = `${projectId}:continue:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "EPISODE_CONTINUATION",
        status: "QUEUED",
        jobKey,
        payload: { additionalSeconds, instruction },
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "PLANNING", progressPercent: 30 },
    });

    const bullJob = await episodeContinuationQueue.add(
      "continue-episode",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        additionalSeconds,
        instruction,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.EPISODE_CONTINUATION,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
