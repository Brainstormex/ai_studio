import { Router } from "express";
import { createProjectSchema, updateProjectSchema } from "@studio/shared";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "../services/project.service.js";

export const projectsRouter: Router = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req, res) => {
  const projects = await listProjects(req.user!.userId);
  res.json({ projects });
});

projectsRouter.post("/", validateBody(createProjectSchema), async (req, res) => {
  try {
    const project = await createProject(req.user!.userId, req.body);
    res.status(201).json({ project });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

projectsRouter.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const project = await getProject(req.user!.userId, id);
    res.json({ project });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

projectsRouter.patch("/:id", validateBody(updateProjectSchema), async (req, res) => {
  try {
    const id = String(req.params.id);
    const project = await updateProject(req.user!.userId, id, req.body);
    res.json({ project });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

projectsRouter.delete("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await deleteProject(req.user!.userId, id);
    res.status(204).send();
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

