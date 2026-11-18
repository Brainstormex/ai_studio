import { Router } from "express";
import { prisma } from "@studio/db";
import { assertBudgetAllowsVideoGeneration, getProjectVideoStatus } from "@studio/pipeline";
import { QUEUE, retryShotVideoSchema, startVideoSchema } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { videoExtensionQueue, videoQueue } from "../queues.js";
import { publishProjectEvent } from "./sse.routes.js";

export const videoRouter: Router = Router({ mergeParams: true });

videoRouter.use(requireAuth);

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

videoRouter.get("/status", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const status = await getProjectVideoStatus(projectId);
    res.json(status);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

videoRouter.post("/start", validateBody(startVideoSchema), async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);

    const shotCount = await prisma.shot.count({
      where: { scene: { chapter: { episode: { projectId } } } },
    });
    if (shotCount === 0) {
      res.status(400).json({ error: "Generate a storyboard before starting video" });
      return;
    }

    await assertBudgetAllowsVideoGeneration(projectId);

    const active = await prisma.generationJob.findFirst({
      where: {
        projectId,
        type: "VIDEO_GENERATION",
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });
    if (active) {
      res.status(409).json({ error: "Video generation already in progress", job: active });
      return;
    }

    const regenerate = Boolean(req.body?.regenerate);
    const shotIds = Array.isArray(req.body?.shotIds) ? req.body.shotIds : undefined;
    const jobKey = `${projectId}:video:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "VIDEO_GENERATION",
        status: "QUEUED",
        jobKey,
        payload: { regenerate, shotIds },
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "GENERATING", progressPercent: 55 },
    });

    if (regenerate) {
      await prisma.shot.updateMany({
        where: {
          scene: { chapter: { episode: { projectId } } },
          ...(shotIds?.length ? { id: { in: shotIds } } : {}),
        },
        data: { status: "QUEUED" },
      });
    } else {
      await prisma.shot.updateMany({
        where: {
          status: { in: ["PENDING", "FAILED"] },
          scene: { chapter: { episode: { projectId } } },
          ...(shotIds?.length ? { id: { in: shotIds } } : {}),
        },
        data: { status: "QUEUED" },
      });
    }

    const bullJob = await videoQueue.add(
      "generate-video",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        regenerate,
        shotIds,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.VIDEO_GENERATION,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

videoRouter.post(
  "/shots/:shotId/retry",
  validateBody(retryShotVideoSchema),
  async (req, res) => {
    try {
      const projectId = projectIdFrom(req);
      await assertProjectOwnership(req.user!.userId, projectId);
      const shotId = String(req.params.shotId);

      const shot = await prisma.shot.findFirst({
        where: {
          id: shotId,
          scene: { chapter: { episode: { projectId } } },
        },
      });
      if (!shot) {
        res.status(404).json({ error: "Shot not found" });
        return;
      }

      const regenerate = req.body?.regenerate !== false;
      const jobKey = `${projectId}:video-shot:${shotId}:${Date.now()}`;
      const jobRecord = await prisma.generationJob.create({
        data: {
          projectId,
          type: "VIDEO_EXTENSION",
          status: "QUEUED",
          jobKey,
          payload: { shotId, regenerate },
        },
      });

      await prisma.shot.update({
        where: { id: shotId },
        data: { status: "QUEUED" },
      });

      const bullJob = await videoExtensionQueue.add(
        "extend-or-retry-shot",
        {
          projectId,
          userId: req.user!.userId,
          jobRecordId: jobRecord.id,
          shotId,
          regenerate,
        },
        { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
      );

      await prisma.generationJob.update({
        where: { id: jobRecord.id },
        data: { bullJobId: String(bullJob.id) },
      });

      publishProjectEvent(projectId, req.user!.userId, "job", {
        type: QUEUE.VIDEO_EXTENSION,
        status: "QUEUED",
        jobId: jobRecord.id,
        shotId,
      });

      res.status(202).json({ job: jobRecord });
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ error: (error as Error).message });
    }
  },
);
