import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { generationRouter } from "./routes/generation.routes.js";
import { referencesRouter } from "./routes/references.routes.js";
import { storyboardRouter } from "./routes/storyboard.routes.js";
import { videoRouter } from "./routes/video.routes.js";
import { audioRouter } from "./routes/audio.routes.js";
import { orchestrationRouter } from "./routes/orchestration.routes.js";
import { renderRouter } from "./routes/render.routes.js";
import { timelineRouter } from "./routes/timeline.routes.js";
import { costsRouter } from "./routes/costs.routes.js";
import { episodesRouter } from "./routes/episodes.routes.js";
import { assetsRouter } from "./routes/assets.routes.js";
import { sseRouter } from "./routes/sse.routes.js";
import { createStorageFromEnv } from "@studio/providers";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "AI Video Studio API",
    phase: 10,
    docs: "/health",
  });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/projects", projectsRouter);
app.use("/projects/:id/generation", generationRouter);
app.use("/projects/:id/references", referencesRouter);
app.use("/projects/:id/storyboard", storyboardRouter);
app.use("/projects/:id/video", videoRouter);
app.use("/projects/:id/audio", audioRouter);
app.use("/projects/:id/orchestration", orchestrationRouter);
app.use("/projects/:id/render", renderRouter);
app.use("/projects/:id/timeline", timelineRouter);
app.use("/projects/:id/costs", costsRouter);
app.use("/projects/:id/episodes", episodesRouter);
app.use("/assets", assetsRouter);
app.use("/sse", sseRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function bootstrap() {
  try {
    const storage = createStorageFromEnv();
    await storage.ensureBucket();
    console.log("Object storage bucket ready");
  } catch (error) {
    console.warn("Storage bootstrap skipped:", error instanceof Error ? error.message : error);
  }

  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

bootstrap();
