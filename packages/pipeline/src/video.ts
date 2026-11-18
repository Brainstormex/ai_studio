import { prisma, type AspectRatio, type Resolution, type VideoStrategy } from "@studio/db";
import {
  createStorageFromEnv,
  createVideoProviderFromEnv,
  type MediaBytes,
  type VideoGenerateInput,
} from "@studio/providers";
import { MODEL_IDS } from "@studio/shared";
import { assertProjectRunnable, patchProjectIfActive } from "./orchestration.js";
import { recordVideoUsage } from "./usage.js";

function mapResolution(value: Resolution): VideoGenerateInput["resolution"] {
  if (value === "P1080") return "1080p";
  if (value === "P4K") return "4k";
  return "720p";
}

function mapAspectRatio(value: AspectRatio): VideoGenerateInput["aspectRatio"] {
  return value === "PORTRAIT_9_16" ? "9:16" : "16:9";
}

function mapTask(strategy: VideoStrategy): VideoGenerateInput["task"] {
  switch (strategy) {
    case "IMAGE_TO_VIDEO":
    case "IMAGE_ANIMATION":
      return "image_to_video";
    case "REFERENCE_TO_VIDEO":
      return "reference_to_video";
    case "FIRST_LAST_FRAME":
      return "first_last_frame";
    case "EXTEND":
      return "extend";
    default:
      return "text_to_video";
  }
}

async function loadAssetBytes(assetId: string): Promise<MediaBytes | null> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return null;
  const storage = createStorageFromEnv();
  const object = await storage.getObject(asset.storageKey, asset.bucket);
  return {
    data: object.body,
    mimeType: asset.mimeType || object.contentType || "application/octet-stream",
  };
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

  return episodes.flatMap((episode) =>
    episode.chapters.flatMap((chapter) =>
      chapter.scenes.flatMap((scene) =>
        scene.shots.map((shot) => ({
          shot,
          scene,
          environmentAssetId: scene.environment?.references[0]?.assetId ?? null,
        })),
      ),
    ),
  );
}

async function characterReferenceBytes(characterIds: string[]): Promise<MediaBytes[]> {
  if (!characterIds.length) return [];
  const refs = await prisma.characterReference.findMany({
    where: {
      characterId: { in: characterIds },
      isPrimary: true,
    },
  });
  const loaded: MediaBytes[] = [];
  for (const ref of refs.slice(0, 6)) {
    const bytes = await loadAssetBytes(ref.assetId);
    if (bytes) loaded.push(bytes);
  }
  return loaded;
}

async function previousSegmentMeta(previousShotId: string | null) {
  if (!previousShotId) return null;
  const segment = await prisma.videoSegment.findFirst({
    where: { shotId: previousShotId, status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
  });
  if (!segment) return null;
  const metadata = (segment.metadata ?? {}) as {
    interactionId?: string;
  };
  return {
    interactionId: metadata.interactionId ?? segment.providerJobId ?? null,
    assetId: segment.assetId,
  };
}

async function storeVideoAsset(params: {
  projectId: string;
  shotId: string;
  videoBytes: Buffer;
  mimeType: string;
  durationMs: number;
  model: string;
  interactionId?: string;
}) {
  const storage = createStorageFromEnv();
  const key = `projects/${params.projectId}/shots/${params.shotId}/${Date.now()}.mp4`;
  const stored = await storage.putObject({
    key,
    body: params.videoBytes,
    contentType: params.mimeType,
  });

  return prisma.asset.create({
    data: {
      projectId: params.projectId,
      type: "VIDEO",
      storageKey: stored.key,
      bucket: stored.bucket,
      mimeType: params.mimeType,
      sizeBytes: params.videoBytes.length,
      durationMs: params.durationMs,
      metadata: {
        model: params.model,
        shotId: params.shotId,
        interactionId: params.interactionId,
        url: stored.url,
      },
    },
  });
}

export async function generateShotVideo(params: {
  projectId: string;
  shotId: string;
  regenerate?: boolean;
}) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: params.projectId },
  });
  const shot = await prisma.shot.findUniqueOrThrow({
    where: { id: params.shotId },
    include: {
      scene: {
        include: {
          environment: {
            include: {
              references: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      },
      videoSegments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const existing = shot.videoSegments[0];
  if (!params.regenerate && existing?.status === "SUCCEEDED" && existing.assetId) {
    return {
      skipped: true,
      shotId: shot.id,
      segmentId: existing.id,
      assetId: existing.assetId,
    };
  }

  if (shot.strategy === "REUSE") {
    const previous = await previousSegmentMeta(shot.previousShotId);
    if (!previous?.assetId) {
      throw new Error(`Shot ${shot.id} REUSE requires a previous succeeded segment`);
    }
    const segment = await prisma.videoSegment.create({
      data: {
        shotId: shot.id,
        assetId: previous.assetId,
        status: "SUCCEEDED",
        strategy: shot.strategy,
        provider: "reuse",
        modelId: MODEL_IDS.video,
        durationMs: shot.targetDurationSec * 1000,
        nativeAudio: true,
        providerJobId: previous.interactionId,
        metadata: { interactionId: previous.interactionId, reusedFrom: shot.previousShotId },
      },
    });
    await prisma.shot.update({
      where: { id: shot.id },
      data: { status: "SUCCEEDED" },
    });
    await prisma.audioSegment.create({
      data: {
        shotId: shot.id,
        status: "SUCCEEDED",
        source: "NATIVE_VIDEO",
        durationMs: shot.targetDurationSec * 1000,
        text: shot.dialogue ?? shot.narration ?? null,
      },
    });
    return {
      skipped: false,
      shotId: shot.id,
      segmentId: segment.id,
      assetId: previous.assetId,
      reused: true,
    };
  }

  await prisma.shot.update({
    where: { id: shot.id },
    data: { status: "GENERATING" },
  });

  const segment = await prisma.videoSegment.create({
    data: {
      shotId: shot.id,
      status: "GENERATING",
      strategy: shot.strategy,
      provider: project.videoProvider,
      modelId: MODEL_IDS.video,
      promptVersion: "v1",
    },
  });

  try {
    const video = createVideoProviderFromEnv();
    const characterRefs = await characterReferenceBytes(shot.characterIds);
    const environmentAssetId = shot.scene.environment?.references[0]?.assetId ?? null;
    const environmentImage = environmentAssetId
      ? await loadAssetBytes(environmentAssetId)
      : null;
    const previous = await previousSegmentMeta(shot.previousShotId);

    let task = mapTask(shot.strategy);
    let previousInteractionId = previous?.interactionId ?? undefined;
    let image = environmentImage ?? characterRefs[0];
    let referenceImages = characterRefs;

    if (task === "extend" && !previousInteractionId) {
      task = characterRefs.length ? "reference_to_video" : environmentImage ? "image_to_video" : "text_to_video";
    }

    if (task === "reference_to_video" && !referenceImages.length && environmentImage) {
      referenceImages = [environmentImage];
    }

    if ((task === "image_to_video" || task === "first_last_frame") && !image) {
      image = referenceImages[0];
    }

    const rendered = await video.render({
      prompt:
        shot.compactPrompt ||
        [
          shot.description,
          shot.cameraAngle ? `Camera: ${shot.cameraAngle}` : "",
          shot.cameraMovement ? `Movement: ${shot.cameraMovement}` : "",
          shot.dialogue ? `Dialogue: ${shot.dialogue}` : "",
          shot.narration ? `Narration: ${shot.narration}` : "",
          shot.continuityNotes ? `Continuity: ${shot.continuityNotes}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      durationSeconds: shot.targetDurationSec,
      aspectRatio: mapAspectRatio(project.aspectRatio),
      resolution: mapResolution(project.resolution),
      task,
      previousInteractionId,
      image: image ?? undefined,
      referenceImages: referenceImages.length ? referenceImages : undefined,
    });

    const asset = await storeVideoAsset({
      projectId: params.projectId,
      shotId: shot.id,
      videoBytes: rendered.videoBytes,
      mimeType: rendered.mimeType,
      durationMs: rendered.durationSeconds * 1000,
      model: MODEL_IDS.video,
      interactionId: rendered.interactionId,
    });

    await prisma.videoSegment.update({
      where: { id: segment.id },
      data: {
        status: "SUCCEEDED",
        assetId: asset.id,
        durationMs: rendered.durationSeconds * 1000,
        nativeAudio: rendered.nativeAudio,
        provider: video.name,
        providerJobId: rendered.interactionId,
        metadata: {
          interactionId: rendered.interactionId,
          task,
        },
      },
    });

    await prisma.audioSegment.create({
      data: {
        shotId: shot.id,
        status: "SUCCEEDED",
        source: "NATIVE_VIDEO",
        durationMs: rendered.durationSeconds * 1000,
        text: shot.dialogue ?? shot.narration ?? null,
        metadata: { fromVideoSegmentId: segment.id },
      },
    });

    await prisma.shot.update({
      where: { id: shot.id },
      data: { status: "SUCCEEDED" },
    });

    await recordVideoUsage({
      projectId: params.projectId,
      provider: video.name,
      model: MODEL_IDS.video,
      operation: `shot-video:${task}`,
      durationSeconds: rendered.durationSeconds,
      resolution: mapResolution(project.resolution),
    });

    return {
      skipped: false,
      shotId: shot.id,
      segmentId: segment.id,
      assetId: asset.id,
      interactionId: rendered.interactionId,
      durationSeconds: rendered.durationSeconds,
      provider: video.name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video generation failed";
    await prisma.videoSegment.update({
      where: { id: segment.id },
      data: {
        status: "FAILED",
        errorMessage: message,
      },
    });
    await prisma.shot.update({
      where: { id: shot.id },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

export async function generateProjectVideos(params: {
  projectId: string;
  regenerate?: boolean;
  shotIds?: string[];
}) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: params.projectId },
  });

  const shots = await orderedShots(params.projectId);
  const selected = params.shotIds?.length
    ? shots.filter((item) => params.shotIds!.includes(item.shot.id))
    : shots;

  if (!selected.length) {
    throw new Error("No shots available for video generation");
  }

  await patchProjectIfActive(params.projectId, {
    status: "GENERATING",
    progressPercent: Math.max(project.progressPercent, 55),
  });

  const results = [];
  let completed = 0;

  for (const item of selected) {
    await assertProjectRunnable(params.projectId);
    const result = await generateShotVideo({
      projectId: params.projectId,
      shotId: item.shot.id,
      regenerate: params.regenerate,
    });
    results.push(result);
    completed += 1;
    const progress =
      55 + Math.round((completed / selected.length) * 30);
    await patchProjectIfActive(params.projectId, {
      progressPercent: Math.min(progress, 85),
    });
  }

  const failed = await prisma.shot.count({
    where: {
      status: "FAILED",
      scene: { chapter: { episode: { projectId: params.projectId } } },
    },
  });
  const pending = await prisma.shot.count({
    where: {
      status: { in: ["PENDING", "QUEUED", "GENERATING"] },
      scene: { chapter: { episode: { projectId: params.projectId } } },
    },
  });

  await patchProjectIfActive(params.projectId, {
    status: failed > 0 ? "FAILED" : "GENERATING",
    ...(pending === 0 ? { progressPercent: 85 } : {}),
  });

  return {
    projectId: params.projectId,
    processed: results.length,
    succeeded: results.length,
    results,
  };
}

export async function getProjectVideoStatus(projectId: string) {
  const shots = await orderedShots(projectId);
  const segments = await prisma.videoSegment.findMany({
    where: { shotId: { in: shots.map((item) => item.shot.id) } },
    orderBy: { createdAt: "desc" },
  });

  const latestByShot = new Map<string, (typeof segments)[number]>();
  for (const segment of segments) {
    if (!latestByShot.has(segment.shotId)) {
      latestByShot.set(segment.shotId, segment);
    }
  }

  const items = shots.map(({ shot }) => {
    const segment = latestByShot.get(shot.id) ?? null;
    return {
      shotId: shot.id,
      number: shot.number,
      description: shot.description,
      strategy: shot.strategy,
      status: shot.status,
      targetDurationSec: shot.targetDurationSec,
      previousShotId: shot.previousShotId,
      segment: segment
        ? {
            id: segment.id,
            status: segment.status,
            assetId: segment.assetId,
            provider: segment.provider,
            modelId: segment.modelId,
            durationMs: segment.durationMs,
            nativeAudio: segment.nativeAudio,
            errorMessage: segment.errorMessage,
            interactionId:
              ((segment.metadata as { interactionId?: string } | null)?.interactionId ??
                segment.providerJobId) ||
              null,
          }
        : null,
    };
  });

  const total = items.length;
  const succeeded = items.filter((item) => item.status === "SUCCEEDED").length;
  const failed = items.filter((item) => item.status === "FAILED").length;
  const generating = items.filter((item) =>
    ["QUEUED", "GENERATING"].includes(item.status),
  ).length;

  return {
    total,
    succeeded,
    failed,
    generating,
    pending: total - succeeded - failed - generating,
    generatedSeconds: items
      .filter((item) => item.status === "SUCCEEDED")
      .reduce((sum, item) => sum + item.targetDurationSec, 0),
    shots: items,
  };
}
