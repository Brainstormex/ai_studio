import { Router } from "express";
import { prisma } from "@studio/db";
import { getProjectTimeline } from "@studio/pipeline";
import { requireAuth } from "../middleware/auth.js";

export const timelineRouter: Router = Router({ mergeParams: true });

timelineRouter.use(requireAuth);

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

timelineRouter.get("/", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const timeline = await getProjectTimeline(projectId);
    res.json(timeline);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
