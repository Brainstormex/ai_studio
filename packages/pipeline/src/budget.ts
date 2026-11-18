import { prisma } from "@studio/db";
import { estimateVideoCostUsd } from "@studio/shared";

function resolutionKey(resolution: string): "360p" | "720p" | "1080p" | "4k" {
  if (resolution === "P360") return "360p";
  if (resolution === "P1080") return "1080p";
  if (resolution === "P4K") return "4k";
  return "720p";
}

export async function getBudgetSnapshot(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      actualCostUsd: true,
      estimatedCostUsd: true,
      budgetLimitUsd: true,
      resolution: true,
      targetDurationSeconds: true,
    },
  });

  const pendingShots = await prisma.shot.findMany({
    where: {
      scene: { chapter: { episode: { projectId } } },
      status: { in: ["PENDING", "QUEUED", "FAILED", "GENERATING"] },
      videoSegments: { none: { status: "SUCCEEDED", assetId: { not: null } } },
    },
    select: { targetDurationSec: true },
  });

  const pendingVideoSeconds = pendingShots.reduce(
    (sum, shot) => sum + shot.targetDurationSec,
    0,
  );
  const pendingVideoEstimateUsd = estimateVideoCostUsd(
    pendingVideoSeconds,
    resolutionKey(project.resolution),
  );
  const actualUsd = Number(project.actualCostUsd ?? 0);
  const budgetLimitUsd =
    project.budgetLimitUsd == null ? null : Number(project.budgetLimitUsd);
  const remainingUsd =
    budgetLimitUsd == null ? null : Math.max(0, budgetLimitUsd - actualUsd);

  return {
    projectId,
    actualUsd,
    estimatedCostUsd: Number(project.estimatedCostUsd ?? 0),
    budgetLimitUsd,
    remainingUsd,
    pendingVideoSeconds,
    pendingVideoEstimateUsd,
    projectedUsd: actualUsd + pendingVideoEstimateUsd,
    overBudget:
      budgetLimitUsd != null ? actualUsd + pendingVideoEstimateUsd > budgetLimitUsd + 1e-9 : false,
  };
}

export async function assertBudgetAllows(
  projectId: string,
  options?: { additionalUsd?: number; label?: string },
) {
  const snapshot = await getBudgetSnapshot(projectId);
  if (snapshot.budgetLimitUsd == null) {
    return snapshot;
  }

  const additionalUsd = options?.additionalUsd ?? 0;
  const projected = snapshot.actualUsd + additionalUsd;
  if (projected > snapshot.budgetLimitUsd + 1e-9) {
    throw Object.assign(
      new Error(
        `Budget exceeded${options?.label ? ` for ${options.label}` : ""}: projected $${projected.toFixed(4)} > limit $${snapshot.budgetLimitUsd.toFixed(4)} (spent $${snapshot.actualUsd.toFixed(4)})`,
      ),
      { status: 402, code: "BUDGET_EXCEEDED", snapshot },
    );
  }

  return snapshot;
}

export async function assertBudgetAllowsVideoGeneration(projectId: string) {
  const snapshot = await getBudgetSnapshot(projectId);
  if (snapshot.budgetLimitUsd == null) {
    return snapshot;
  }
  if (snapshot.overBudget) {
    throw Object.assign(
      new Error(
        `Budget exceeded for video generation: projected $${snapshot.projectedUsd.toFixed(4)} > limit $${snapshot.budgetLimitUsd.toFixed(4)} (spent $${snapshot.actualUsd.toFixed(4)}, pending video ~$${snapshot.pendingVideoEstimateUsd.toFixed(4)})`,
      ),
      { status: 402, code: "BUDGET_EXCEEDED", snapshot },
    );
  }
  return snapshot;
}

export function assertCreateWithinBudget(params: {
  estimatedCostUsd: number;
  budgetLimitUsd?: number | null;
}) {
  if (params.budgetLimitUsd == null) return;
  if (params.estimatedCostUsd > params.budgetLimitUsd + 1e-9) {
    throw Object.assign(
      new Error(
        `Estimated cost $${params.estimatedCostUsd.toFixed(2)} exceeds budget limit $${params.budgetLimitUsd.toFixed(2)}`,
      ),
      { status: 400, code: "BUDGET_TOO_LOW" },
    );
  }
}
