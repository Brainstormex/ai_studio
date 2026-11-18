import { Router } from "express";
import multer from "multer";
import { prisma } from "@studio/db";
import { QUEUE, generateStorySchema } from "@studio/shared";
import { parseUploadedDocument } from "@studio/pipeline";
import { createStorageFromEnv } from "@studio/providers";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { scriptQueue, storyQueue } from "../queues.js";
import { publishProjectEvent } from "./sse.routes.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

export const generationRouter: Router = Router({ mergeParams: true });

generationRouter.use(requireAuth);

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

generationRouter.post("/story", validateBody(generateStorySchema), async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    const project = await assertProjectOwnership(req.user!.userId, projectId);

    if (project.mode !== "TOPIC_TO_VIDEO") {
      res.status(400).json({ error: "Story generation requires TOPIC_TO_VIDEO mode" });
      return;
    }
    if (!project.topic) {
      res.status(400).json({ error: "Project topic is required" });
      return;
    }

    const jobKey = `${projectId}:story:${Date.now()}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "STORY_GENERATION",
        status: "QUEUED",
        jobKey,
        payload: { regenerate: req.body.regenerate ?? false },
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "PLANNING", progressPercent: 5 },
    });

    const bullJob = await storyQueue.add(
      "generate-story",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.STORY_GENERATION,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

generationRouter.post("/script", upload.single("file"), async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    const project = await assertProjectOwnership(req.user!.userId, projectId);

    if (project.mode !== "SCRIPT_TO_VIDEO") {
      res.status(400).json({ error: "Script analysis requires SCRIPT_TO_VIDEO mode" });
      return;
    }

    let sourceType = "txt";
    let text = "";

    if (req.file) {
      const parsed = await parseUploadedDocument(
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype,
      );
      sourceType = parsed.sourceType;
      text = parsed.text;

      const storage = createStorageFromEnv();
      const key = `projects/${projectId}/scripts/${Date.now()}-${req.file.originalname}`;
      await storage.putObject({
        key,
        body: req.file.buffer,
        contentType: req.file.mimetype || "application/octet-stream",
      });
    } else if (typeof req.body?.scriptText === "string" && req.body.scriptText.trim()) {
      text = req.body.scriptText;
      sourceType = "paste";
    } else {
      res.status(400).json({ error: "Provide a script file or scriptText" });
      return;
    }

    const script = await prisma.script.create({
      data: {
        projectId,
        sourceType,
        language: project.storyLanguage,
        rawText: text,
      },
    });

    const jobKey = `${projectId}:script:${script.id}`;
    const jobRecord = await prisma.generationJob.create({
      data: {
        projectId,
        type: "SCRIPT_ANALYSIS",
        status: "QUEUED",
        jobKey,
        payload: { scriptId: script.id, sourceType },
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "PLANNING", progressPercent: 5 },
    });

    const bullJob = await scriptQueue.add(
      "analyze-script",
      {
        projectId,
        userId: req.user!.userId,
        jobRecordId: jobRecord.id,
        scriptId: script.id,
      },
      { jobId: jobKey, removeOnComplete: 100, removeOnFail: 100 },
    );

    await prisma.generationJob.update({
      where: { id: jobRecord.id },
      data: { bullJobId: String(bullJob.id) },
    });

    publishProjectEvent(projectId, req.user!.userId, "job", {
      type: QUEUE.SCRIPT_ANALYSIS,
      status: "QUEUED",
      jobId: jobRecord.id,
    });

    res.status(202).json({ job: jobRecord, script: { id: script.id, sourceType } });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

generationRouter.get("/jobs", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const jobs = await prisma.generationJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ jobs });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

generationRouter.get("/screenplay", async (req, res) => {
  try {
    const projectId = projectIdFrom(req);
    await assertProjectOwnership(req.user!.userId, projectId);
    const script = await prisma.script.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        characters: true,
        environments: true,
        episodes: {
          orderBy: { number: "asc" },
          include: {
            chapters: {
              orderBy: { number: "asc" },
              include: {
                scenes: { orderBy: { number: "asc" } },
              },
            },
          },
        },
      },
    });
    res.json({
      structured: script?.structured ?? null,
      characters: project.characters,
      environments: project.environments,
      episodes: project.episodes,
      storySummary: project.storySummary,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
