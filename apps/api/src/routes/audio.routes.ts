import { Router } from "express";
import { prisma } from "@studio/db";
import { getProjectAudioStatus } from "@studio/pipeline";
import { QUEUE, retryShotAudioSchema, startAudioSchema } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { audioQueue } from "../queues.js";
import { publishProjectEvent } from "./sse.routes.js";

export const audioRouter: Router = Router({ mergeParams: true });

audioRouter.use(requireAuth);

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

audioRouter.get("/status", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const status = await getProjectAudioStatus(projectId);
    res.json(status);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

audioRouter.post("/start", validateBody(startAudioSchema), async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);

    const shotCount = await prisma.shot.count({
      where: { scene: { chapter: { episode: { projectId } } } },
    });
    if (shotCount === 0) {
      res.status(400).json({ error: "Generate a storyboard before starting audio" });
      return;
    }

    const active = await prisma.generationJob.findFirst({
      where: {
        projectId,
        type: "AUDIO_GENERATION",
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });
    if (active) {
      res.status(409).json({ error: "Audio generation already in progress", job: active });
      return;
    }

    const regenerate = Boolean(req.body?.regenerate);
    const forceTts = Boolean(req.body?.forceTts);
    const shotIds = Array.isArray(req.body?.shotIds) ? req.body.shotIds : undefined;
    const jobKey = `${projectId}:audio:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "AUDIO_GENERATION",
        status: "QUEUED",
        jobKey,
        payload: { regenerate, forceTts, shotIds },
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "GENERATING", progressPercent: 86 },
    });

    const bullJob = await audioQueue.add(
      "generate-audio",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        regenerate,
        forceTts,
        shotIds,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.AUDIO_GENERATION,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

audioRouter.post(
  "/shots/:shotId/retry",
  validateBody(retryShotAudioSchema),
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

      const forceTts = req.body?.forceTts !== false;
      const jobKey = `${projectId}:audio-shot:${shotId}:${Date.now()}`;
      const jobRecord = await prisma.generationJob.create({
        data: {
          projectId,
          type: "AUDIO_GENERATION",
          status: "QUEUED",
          jobKey,
          payload: { shotIds: [shotId], forceTts, regenerate: true },
        },
      });

      const bullJob = await audioQueue.add(
        "generate-audio-shot",
        {
          projectId,
          userId: req.user!.userId,
          jobRecordId: jobRecord.id,
          shotIds: [shotId],
          forceTts,
          regenerate: true,
        },
        { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
      );

      await prisma.generationJob.update({
        where: { id: jobRecord.id },
        data: { bullJobId: String(bullJob.id) },
      });

      publishProjectEvent(projectId, req.user!.userId, "job", {
        type: QUEUE.AUDIO_GENERATION,
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
