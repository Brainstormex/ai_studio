import { prisma } from "@studio/db";
import { createStorageFromEnv } from "@studio/providers";
import { patchProjectIfActive } from "./orchestration.js";

export type QcIssue = {
  shotId: string;
  kind: "video" | "audio";
  code: string;
  message: string;
};

async function orderedShotIds(projectId: string) {
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

async function validateAsset(params: {
  assetId: string | null | undefined;
  minBytes: number;
  expectedType: "VIDEO" | "AUDIO";
}): Promise<{ ok: boolean; code?: string; message?: string; sizeBytes?: number }> {
  if (!params.assetId) {
    return { ok: false, code: "missing-asset", message: "Segment has no asset" };
  }
  const asset = await prisma.asset.findUnique({ where: { id: params.assetId } });
  if (!asset) {
    return { ok: false, code: "asset-not-found", message: "Asset row missing" };
  }
  if (asset.type !== params.expectedType) {
    return {
      ok: false,
      code: "asset-type",
      message: `Expected ${params.expectedType}, got ${asset.type}`,
    };
  }

  const storage = createStorageFromEnv();
  try {
    const object = await storage.getObject(asset.storageKey, asset.bucket);
    const size = object.body.length;
    if (size < params.minBytes) {
      return {
        ok: false,
        code: "asset-too-small",
        message: `Asset size ${size} < ${params.minBytes}`,
        sizeBytes: size,
      };
    }
    return { ok: true, sizeBytes: size };
  } catch (error) {
    return {
      ok: false,
      code: "asset-unreadable",
      message: error instanceof Error ? error.message : "Failed to read asset",
    };
  }
}

export async function runQualityControl(params: {
  projectId: string;
  scope?: "video" | "audio" | "all";
}) {
  const scope = params.scope ?? "all";
  const shots = await orderedShotIds(params.projectId);
  const issues: QcIssue[] = [];
  let videoChecked = 0;
  let audioChecked = 0;
  let videoPassed = 0;
  let audioPassed = 0;

  for (const shot of shots) {
    if (scope === "video" || scope === "all") {
      videoChecked += 1;
      const segment = shot.videoSegments[0];
      if (!segment || segment.status !== "SUCCEEDED") {
        issues.push({
          shotId: shot.id,
          kind: "video",
          code: "video-missing",
          message: "Video segment not succeeded",
        });
      } else {
        const durationOk =
          typeof segment.durationMs === "number" &&
          segment.durationMs >= 2500 &&
          segment.durationMs <= 20000;
        if (!durationOk) {
          issues.push({
            shotId: shot.id,
            kind: "video",
            code: "video-duration",
            message: `Unexpected durationMs=${segment.durationMs}`,
          });
        }
        const assetCheck = await validateAsset({
          assetId: segment.assetId,
          minBytes: 20,
          expectedType: "VIDEO",
        });
        if (!assetCheck.ok) {
          issues.push({
            shotId: shot.id,
            kind: "video",
            code: assetCheck.code ?? "video-asset",
            message: assetCheck.message ?? "Video asset failed QC",
          });
        } else if (durationOk) {
          videoPassed += 1;
          await prisma.videoSegment.update({
            where: { id: segment.id },
            data: {
              metadata: {
                ...((segment.metadata as object) ?? {}),
                qc: { passed: true, checkedAt: new Date().toISOString(), sizeBytes: assetCheck.sizeBytes },
              },
            },
          });
        }
      }
    }

    if (scope === "audio" || scope === "all") {
      audioChecked += 1;
      const segment = shot.audioSegments[0];
      if (!segment || segment.status !== "SUCCEEDED") {
        issues.push({
          shotId: shot.id,
          kind: "audio",
          code: "audio-missing",
          message: "Audio segment not succeeded",
        });
      } else if (segment.source === "NONE") {
        audioPassed += 1;
      } else if (segment.source === "NATIVE_VIDEO") {
        audioPassed += 1;
        await prisma.audioSegment.update({
          where: { id: segment.id },
          data: {
            metadata: {
              ...((segment.metadata as object) ?? {}),
              qc: { passed: true, checkedAt: new Date().toISOString(), source: "NATIVE_VIDEO" },
            },
          },
        });
      } else {
        const assetCheck = await validateAsset({
          assetId: segment.assetId,
          minBytes: 44,
          expectedType: "AUDIO",
        });
        if (!assetCheck.ok) {
          issues.push({
            shotId: shot.id,
            kind: "audio",
            code: assetCheck.code ?? "audio-asset",
            message: assetCheck.message ?? "Audio asset failed QC",
          });
        } else {
          audioPassed += 1;
          await prisma.audioSegment.update({
            where: { id: segment.id },
            data: {
              metadata: {
                ...((segment.metadata as object) ?? {}),
                qc: { passed: true, checkedAt: new Date().toISOString(), sizeBytes: assetCheck.sizeBytes },
              },
            },
          });
        }
      }
    }
  }

  const passed = issues.length === 0;
  await patchProjectIfActive(params.projectId, {
    ...(passed ? { progressPercent: 93, status: "GENERATING" as const } : { status: "FAILED" as const }),
  });

  return {
    projectId: params.projectId,
    scope,
    passed,
    issueCount: issues.length,
    issues,
    videoChecked,
    audioChecked,
    videoPassed,
    audioPassed,
  };
}
