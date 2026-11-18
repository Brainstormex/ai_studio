import { Router } from "express";
import { prisma } from "@studio/db";
import { QUEUE, runOrchestrationSchema } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  cancelGeneration,
  getOrchestrationStatus,
  pauseGeneration,
  resumeGeneration,
  runOrchestration,
} from "../services/orchestration.service.js";
import { publishProjectEvent } from "./sse.routes.js";

export const orchestrationRouter: Router = Router({ mergeParams: true });

orchestrationRouter.use(requireAuth);

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

orchestrationRouter.get("/status", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const status = await getOrchestrationStatus(projectId);
    res.json(status);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

orchestrationRouter.post("/run", validateBody(runOrchestrationSchema), async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const result = await runOrchestration({
      projectId,
      userId: req.user!.userId,
      through: req.body.through,
      forceTts: req.body.forceTts,
      regenerate: req.body.regenerate,
    });
    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: "orchestration-run",
      status: result.done ? "DONE" : "QUEUED",
      nextStage: result.nextStage,
    });
    res.status(result.done ? 200 : 202).json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

orchestrationRouter.post("/pause", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const result = await pauseGeneration(projectId);
    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.QUALITY_CONTROL,
      status: "PAUSED",
    });
    res.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

orchestrationRouter.post("/resume", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const result = await resumeGeneration({
      projectId,
      userId: req.user!.userId,
    });
    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: "orchestration-resume",
      status: "GENERATING",
      nextStage: result.nextStage,
    });
    res.status(202).json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

orchestrationRouter.post("/cancel", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const result = await cancelGeneration(projectId);
    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: "orchestration-cancel",
      status: "CANCELLED",
    });
    res.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
