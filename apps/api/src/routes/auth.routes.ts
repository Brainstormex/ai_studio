import { Router } from "express";
import { loginSchema, registerSchema } from "@studio/shared";
import { validateBody } from "../middleware/validate.js";
import {
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
} from "../services/auth.service.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "@studio/db";

export const authRouter: Router = Router();

authRouter.post("/register", validateBody(registerSchema), async (req, res) => {
  try {
    const result = await registerUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  try {
    const result = await loginUser(req.body);
    res.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

authRouter.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken as string | undefined;
    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken is required" });
      return;
    }
    const result = await refreshSession(refreshToken);
    res.json(result);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    res.status(status).json({ error: (error as Error).message });
  }
});

authRouter.post("/logout", async (req, res) => {
  await logoutSession(req.body?.refreshToken as string | undefined);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user });
});
