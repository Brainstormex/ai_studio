import { Router } from "express";
import { prisma } from "@studio/db";
import { QUEUE } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { characterQueue, environmentQueue } from "../queues.js";
import { publishProjectEvent } from "./sse.routes.js";

export const referencesRouter: Router = Router({ mergeParams: true });

referencesRouter.use(requireAuth);

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

referencesRouter.get("/", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);

    const [characters, environments] = await Promise.all([
      prisma.character.findMany({
        where: { projectId },
        include: {
          references: {
            include: { asset: true },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.environment.findMany({
        where: { projectId },
        include: {
          references: {
            include: { asset: true },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
    ]);

    res.json({
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        description: character.description,
        physicalAppearance: character.physicalAppearance,
        clothing: character.clothing,
        personality: character.personality,
        references: character.references.map((ref) => ({
          id: ref.id,
          expression: ref.expression,
          isPrimary: ref.isPrimary,
          assetId: ref.assetId,
          mimeType: ref.asset.mimeType,
          contentUrl: `/assets/${ref.assetId}/content`,
        })),
      })),
      environments: environments.map((environment) => ({
        id: environment.id,
        name: environment.name,
        description: environment.description,
        lighting: environment.lighting,
        colorPalette: environment.colorPalette,
        references: environment.references.map((ref) => ({
          id: ref.id,
          isPrimary: ref.isPrimary,
          assetId: ref.assetId,
          mimeType: ref.asset.mimeType,
          contentUrl: `/assets/${ref.assetId}/content`,
        })),
      })),
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

referencesRouter.post("/characters/generate", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const regenerate = Boolean(req.body?.regenerate);
    const characterIds = Array.isArray(req.body?.characterIds)
      ? (req.body.characterIds as string[])
      : undefined;

    const jobKey = `${projectId}:characters:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "CHARACTER_GENERATION",
        status: "QUEUED",
        jobKey,
        payload: { regenerate, characterIds },
      },
    });

    const bullJob = await characterQueue.add(
      "generate-characters",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        characterIds,
        regenerate,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.CHARACTER_GENERATION,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

referencesRouter.post("/environments/generate", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const regenerate = Boolean(req.body?.regenerate);
    const environmentIds = Array.isArray(req.body?.environmentIds)
      ? (req.body.environmentIds as string[])
      : undefined;

    const jobKey = `${projectId}:environments:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "ENVIRONMENT_GENERATION",
        status: "QUEUED",
        jobKey,
        payload: { regenerate, environmentIds },
      },
    });

    const bullJob = await environmentQueue.add(
      "generate-environments",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        environmentIds,
        regenerate,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.ENVIRONMENT_GENERATION,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
