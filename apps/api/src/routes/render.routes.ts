import { Router } from "express";
import { prisma } from "@studio/db";
import { getProjectRenderStatus } from "@studio/pipeline";
import { DEFAULT_JOB_OPTIONS, QUEUE, startRenderSchema } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { renderQueue } from "../queues.js";
import { publishProjectEvent } from "./sse.routes.js";

export const renderRouter: Router = Router({ mergeParams: true });

renderRouter.use(requireAuth);

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

renderRouter.get("/status", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const status = await getProjectRenderStatus(projectId);
    res.json(status);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

renderRouter.post("/start", validateBody(startRenderSchema), async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);

    const videoReady = await prisma.shot.count({
      where: {
        status: "SUCCEEDED",
        scene: { chapter: { episode: { projectId } } },
      },
    });
    if (videoReady < 1) {
      res.status(400).json({ error: "Generate video clips before rendering" });
      return;
    }

    const active = await prisma.generationJob.findFirst({
      where: {
        projectId,
        type: "VIDEO_RENDERING",
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });
    if (active) {
      res.status(409).json({ error: "Render already in progress", job: active });
      return;
    }

    const includeTitles = req.body?.includeTitles !== false;
    const burnSubtitles = req.body?.burnSubtitles !== false;
    const jobKey = `${projectId}:render:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "VIDEO_RENDERING",
        status: "QUEUED",
        jobKey,
        payload: { includeTitles, burnSubtitles },
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "RENDERING", progressPercent: 94 },
    });

    const bullJob = await renderQueue.add(
      "render-video",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        includeTitles,
        burnSubtitles,
      },
      { jobId: jobKey, ...DEFAULT_JOB_OPTIONS },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.VIDEO_RENDERING,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
