import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma, type Resolution } from "@studio/db";
import { createStorageFromEnv } from "@studio/providers";
import {
  ensureDir,
  isReadableMedia,
  resolutionSize,
  runFfmpeg,
} from "./ffmpeg.js";
import { assertProjectRunnable, patchProjectIfActive } from "./orchestration.js";

function escapeDrawText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .slice(0, 80);
}

async function orderedShots(projectId: string) {
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
              shots: {
                orderBy: { number: "asc" },
                include: {
                  videoSegments: { orderBy: { createdAt: "desc" }, take: 1 },
                  audioSegments: { orderBy: { createdAt: "desc" }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  return episodes.flatMap((episode) =>
    episode.chapters.flatMap((chapter) =>
      chapter.scenes.flatMap((scene) => scene.shots),
    ),
  );
}

async function writeAssetToFile(assetId: string, destPath: string) {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  const storage = createStorageFromEnv();
  const object = await storage.getObject(asset.storageKey, asset.bucket);
  await fs.writeFile(destPath, object.body);
  return asset;
}

async function makePlaceholderClip(params: {
  outPath: string;
  durationSec: number;
  width: number;
  height: number;
  label: string;
}) {
  const text = escapeDrawText(params.label || "Scene");
  try {
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x1a1a1a:s=${params.width}x${params.height}:d=${params.durationSec}`,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-vf",
      `drawtext=text='${text}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
      "-t",
      String(params.durationSec),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      params.outPath,
    ]);
  } catch {
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x1a1a1a:s=${params.width}x${params.height}:d=${params.durationSec}`,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-t",
      String(params.durationSec),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      params.outPath,
    ]);
  }
}

async function normalizeClip(params: {
  inputPath: string;
  outputPath: string;
  durationSec: number;
  width: number;
  height: number;
  label: string;
  audioPath?: string | null;
}) {
  const readable = await isReadableMedia(params.inputPath);
  const sourcePath = readable
    ? params.inputPath
    : path.join(path.dirname(params.outputPath), `placeholder-${path.basename(params.outputPath)}`);

  if (!readable) {
    await makePlaceholderClip({
      outPath: sourcePath,
      durationSec: params.durationSec,
      width: params.width,
      height: params.height,
      label: params.label,
    });
  }

  const filter = `scale=${params.width}:${params.height}:force_original_aspect_ratio=decrease,pad=${params.width}:${params.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p`;

  if (params.audioPath) {
    await runFfmpeg([
      "-y",
      "-i",
      sourcePath,
      "-i",
      params.audioPath,
      "-filter_complex",
      `[0:v]${filter}[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a:0",
      "-t",
      String(params.durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-shortest",
      params.outputPath,
    ]);
    return;
  }

  try {
    await runFfmpeg([
      "-y",
      "-i",
      sourcePath,
      "-vf",
      filter,
      "-t",
      String(params.durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      params.outputPath,
    ]);
  } catch {
    await runFfmpeg([
      "-y",
      "-i",
      sourcePath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-filter_complex",
      `[0:v]${filter}[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a:0",
      "-t",
      String(params.durationSec),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-shortest",
      params.outputPath,
    ]);
  }
}

async function makeCard(params: {
  outPath: string;
  durationSec: number;
  width: number;
  height: number;
  title: string;
  subtitle?: string;
}) {
  const title = escapeDrawText(params.title);
  const subtitle = params.subtitle ? escapeDrawText(params.subtitle) : "";
  const vf = subtitle
    ? `drawtext=text='${title}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=text='${subtitle}':fontsize=28:fontcolor=0xcccccc:x=(w-text_w)/2:y=(h-text_h)/2+30`
    : `drawtext=text='${title}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`;

  try {
    await runFfmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x0b0b0b:s=${params.width}x${params.height}:d=${params.durationSec}`,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-vf",
      vf,
      "-t",
      String(params.durationSec),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      params.outPath,
    ]);
  } catch {
    await makePlaceholderClip({
      outPath: params.outPath,
      durationSec: params.durationSec,
      width: params.width,
      height: params.height,
      label: params.title,
    });
  }
}

export async function renderProjectVideo(params: {
  projectId: string;
  includeTitles?: boolean;
  burnSubtitles?: boolean;
}) {
  await assertProjectRunnable(params.projectId);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: params.projectId },
  });
  const size = resolutionSize(project.resolution as Resolution);
  const shots = await orderedShots(params.projectId);
  const ready = shots.filter((shot) => shot.videoSegments[0]?.status === "SUCCEEDED");
  if (!ready.length) {
    throw new Error("No succeeded video segments to render");
  }

  await patchProjectIfActive(params.projectId, {
    status: "RENDERING",
    progressPercent: Math.max(project.progressPercent, 94),
  });

  const renderJob = await prisma.renderJob.create({
    data: {
      projectId: params.projectId,
      status: "RUNNING",
      resolution: project.resolution,
      startedAt: new Date(),
    },
  });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `studio-render-${params.projectId}-`));
  const normalized: string[] = [];

  try {
    const includeTitles = params.includeTitles !== false;
    if (includeTitles) {
      const titlePath = path.join(workDir, "title.mp4");
      await makeCard({
        outPath: titlePath,
        durationSec: 3,
        width: size.width,
        height: size.height,
        title: project.title,
        subtitle: project.topic?.slice(0, 60) || undefined,
      });
      normalized.push(titlePath);
    }

    for (const [index, shot] of ready.entries()) {
      await assertProjectRunnable(params.projectId);
      const segment = shot.videoSegments[0]!;
      if (!segment.assetId) {
        throw new Error(`Shot ${shot.id} missing video asset`);
      }

      const rawVideo = path.join(workDir, `shot-${index}-raw.mp4`);
      await writeAssetToFile(segment.assetId, rawVideo);

      let audioPath: string | null = null;
      const audio = shot.audioSegments[0];
      if (audio?.source === "CLOUD_TTS" && audio.assetId) {
        audioPath = path.join(workDir, `shot-${index}-tts.audio`);
        await writeAssetToFile(audio.assetId, audioPath);
      }

      const outPath = path.join(workDir, `shot-${index}-norm.mp4`);
      await normalizeClip({
        inputPath: rawVideo,
        outputPath: outPath,
        durationSec: shot.targetDurationSec,
        width: size.width,
        height: size.height,
        label: `Shot ${shot.number}`,
        audioPath,
      });
      normalized.push(outPath);

      await patchProjectIfActive(params.projectId, {
        progressPercent: 94 + Math.round(((index + 1) / ready.length) * 3),
      });
    }

    if (includeTitles) {
      const creditsPath = path.join(workDir, "credits.mp4");
      await makeCard({
        outPath: creditsPath,
        durationSec: 3,
        width: size.width,
        height: size.height,
        title: "Lumen Stage",
        subtitle: "Generated with Omni",
      });
      normalized.push(creditsPath);
    }

    const listPath = path.join(workDir, "concat.txt");
    await fs.writeFile(
      listPath,
      normalized.map((file) => `file '${file.replace(/\\/g, "/")}'`).join("\n"),
      "utf8",
    );

    const assembledPath = path.join(workDir, "assembled.mp4");
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      assembledPath,
    ]);

    let finalPath = assembledPath;
    const burnSubtitles = params.burnSubtitles !== false;
    const subtitle = await prisma.subtitle.findFirst({
      where: { projectId: params.projectId },
      orderBy: { createdAt: "desc" },
    });

    if (burnSubtitles && subtitle?.content) {
      const srtPath = path.join(workDir, "subs.srt");
      await fs.writeFile(srtPath, subtitle.content, "utf8");
      const subtitledPath = path.join(workDir, "final-subs.mp4");
      const srtEscaped = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      try {
        await runFfmpeg([
          "-y",
          "-i",
          assembledPath,
          "-vf",
          `subtitles='${srtEscaped}'`,
          "-c:a",
          "copy",
          subtitledPath,
        ]);
        finalPath = subtitledPath;
      } catch {
        const softPath = path.join(workDir, "final-softsubs.mp4");
        await runFfmpeg([
          "-y",
          "-i",
          assembledPath,
          "-i",
          srtPath,
          "-c",
          "copy",
          "-c:s",
          "mov_text",
          softPath,
        ]);
        finalPath = softPath;
      }
    }

    const outputBytes = await fs.readFile(finalPath);
    const storage = createStorageFromEnv();
    const key = `projects/${params.projectId}/renders/${Date.now()}-${size.label}.mp4`;
    const stored = await storage.putObject({
      key,
      body: outputBytes,
      contentType: "video/mp4",
    });

    const asset = await prisma.asset.create({
      data: {
        projectId: params.projectId,
        type: "VIDEO",
        storageKey: stored.key,
        bucket: stored.bucket,
        mimeType: "video/mp4",
        sizeBytes: outputBytes.length,
        width: size.width,
        height: size.height,
        durationMs:
          (includeTitles ? 6000 : 0) +
          ready.reduce((sum, shot) => sum + shot.targetDurationSec * 1000, 0),
        metadata: {
          kind: "final-render",
          resolution: size.label,
          shotCount: ready.length,
          url: stored.url,
          includeTitles,
          burnSubtitles,
        },
      },
    });

    await prisma.renderJob.update({
      where: { id: renderJob.id },
      data: {
        status: "SUCCEEDED",
        outputAssetId: asset.id,
        finishedAt: new Date(),
      },
    });

    await patchProjectIfActive(params.projectId, {
      status: "COMPLETED",
      progressPercent: 100,
    });

    return {
      renderJobId: renderJob.id,
      assetId: asset.id,
      sizeBytes: outputBytes.length,
      width: size.width,
      height: size.height,
      shotCount: ready.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render failed";
    await prisma.renderJob.update({
      where: { id: renderJob.id },
      data: {
        status: "FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
    await patchProjectIfActive(params.projectId, { status: "FAILED" });
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function getProjectRenderStatus(projectId: string) {
  const renders = await prisma.renderJob.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { outputAsset: true },
  });

  const latest = renders[0] ?? null;
  return {
    latest: latest
      ? {
          id: latest.id,
          status: latest.status,
          resolution: latest.resolution,
          outputAssetId: latest.outputAssetId,
          errorMessage: latest.errorMessage,
          startedAt: latest.startedAt,
          finishedAt: latest.finishedAt,
          sizeBytes: latest.outputAsset?.sizeBytes ?? null,
          mimeType: latest.outputAsset?.mimeType ?? null,
        }
      : null,
    renders: renders.map((item) => ({
      id: item.id,
      status: item.status,
      outputAssetId: item.outputAssetId,
      resolution: item.resolution,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
    })),
  };
}
