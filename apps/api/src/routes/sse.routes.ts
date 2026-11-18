import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "@studio/db";

type SseClient = {
  userId: string;
  projectId: string;
  res: import("express").Response;
};

const clients = new Set<SseClient>();

export function publishProjectEvent(
  projectId: string,
  userId: string,
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.projectId === projectId && client.userId === userId) {
      client.res.write(payload);
    }
  }
}

export const sseRouter: Router = Router();

sseRouter.get("/projects/:id/events", requireAuth, async (req, res) => {
  const projectId = String(req.params.id);
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user!.userId },
    select: { id: true, status: true, progressPercent: true },
  });


  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const client: SseClient = {
    userId: req.user!.userId,
    projectId: project.id,
    res,
  };
  clients.add(client);

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      projectId: project.id,
      status: project.status,
      progressPercent: project.progressPercent,
      phase: 1,
      message: "SSE connected. Live generation events arrive in later phases.",
    })}\n\n`,
  );

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
});
