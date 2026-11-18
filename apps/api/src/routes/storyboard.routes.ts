import { Router } from "express";
import { prisma } from "@studio/db";
import { QUEUE } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { storyboardQueue } from "../queues.js";
import { publishProjectEvent } from "./sse.routes.js";

export const storyboardRouter: Router = Router({ mergeParams: true });

storyboardRouter.use(requireAuth);

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

storyboardRouter.get("/", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);

    const episodes = await prisma.episode.findMany({
      where: { projectId },
      orderBy: { number: "asc" },
      include: {
        chapters: {
          orderBy: { number: "asc" },
          include: {
            scenes: {
              orderBy: { number: "asc" },
              include: {
                shots: { orderBy: { number: "asc" } },
                environment: {
                  include: {
                    references: {
                      where: { isPrimary: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const characters = await prisma.character.findMany({
      where: { projectId },
      select: { id: true, name: true },
    });
    const characterNameById = new Map(characters.map((item) => [item.id, item.name]));

    const shots = episodes.flatMap((episode) =>
      episode.chapters.flatMap((chapter) =>
        chapter.scenes.flatMap((scene) =>
          scene.shots.map((shot) => ({
            id: shot.id,
            number: shot.number,
            description: shot.description,
            compactPrompt: shot.compactPrompt,
            cameraAngle: shot.cameraAngle,
            cameraMovement: shot.cameraMovement,
            dialogue: shot.dialogue,
            narration: shot.narration,
            targetDurationSec: shot.targetDurationSec,
            strategy: shot.strategy,
            status: shot.status,
            continuityNotes: shot.continuityNotes,
            previousShotId: shot.previousShotId,
            characterIds: shot.characterIds,
            characterNames: shot.characterIds
              .map((id) => characterNameById.get(id))
              .filter(Boolean),
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            sceneNumber: scene.number,
            sceneTitle: scene.title,
            locationName: scene.locationName,
            environmentId: scene.environmentId,
          })),
        ),
      ),
    );

    const plannedSeconds = shots.reduce((sum, shot) => sum + shot.targetDurationSec, 0);

    res.json({
      plannedSeconds,
      shotCount: shots.length,
      episodes,
      shots,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

storyboardRouter.post("/generate", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const regenerate = Boolean(req.body?.regenerate);

    const jobKey = `${projectId}:storyboard:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "STORYBOARD_GENERATION",
        status: "QUEUED",
        jobKey,
        payload: { regenerate },
      },
    });

    const bullJob = await storyboardQueue.add(
      "generate-storyboard",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        regenerate,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.STORYBOARD_GENERATION,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
