import { Router } from "express";
import { prisma } from "@studio/db";
import { createStorageFromEnv } from "@studio/providers";
import { requireAuth } from "../middleware/auth.js";

export const assetsRouter: Router = Router();

assetsRouter.get("/:assetId/content", requireAuth, async (req, res) => {
  try {
    const assetId = String(req.params.assetId);
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (asset.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: asset.projectId, userId: req.user!.userId },
        select: { id: true },
      });
      if (!project) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
    }

    const storage = createStorageFromEnv();
    const object = await storage.getObject(asset.storageKey, asset.bucket);
    res.setHeader("Content-Type", asset.mimeType || object.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(object.body);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});
