import { prisma } from "@studio/db";
import { assertCreateWithinBudget } from "@studio/pipeline";
import { estimateVideoCostUsd, type CreateProjectInput, type UpdateProjectInput } from "@studio/shared";

function resolutionToPricingKey(resolution: string): "720p" | "1080p" | "4k" {
  if (resolution === "P1080") return "1080p";
  if (resolution === "P4K") return "4k";
  return "720p";
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const estimatedCostUsd = estimateVideoCostUsd(
    input.targetDurationSeconds,
    resolutionToPricingKey(input.resolution),
  );
  assertCreateWithinBudget({
    estimatedCostUsd,
    budgetLimitUsd: input.budgetLimitUsd,
  });

  return prisma.project.create({
    data: {
      userId,
      title: input.title,
      mode: input.mode,
      topic: input.topic,
      targetDurationSeconds: input.targetDurationSeconds,
      storyLanguage: input.storyLanguage,
      dialogueLanguage: input.dialogueLanguage,
      narrationLanguage: input.narrationLanguage,
      voiceLanguage: input.voiceLanguage,
      subtitleLanguage: input.subtitleLanguage,
      visualStyle: input.visualStyle,
      customStyleNotes: input.customStyleNotes,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      videoProvider: input.videoProvider,
      budgetLimitUsd: input.budgetLimitUsd,
      estimatedCostUsd,
      status: "DRAFT",
    },
  });
}

export async function listProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      mode: true,
      status: true,
      targetDurationSeconds: true,
      storyLanguage: true,
      visualStyle: true,
      resolution: true,
      progressPercent: true,
      estimatedCostUsd: true,
      actualCostUsd: true,
      budgetLimitUsd: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      episodes: {
        orderBy: { number: "asc" },
        include: {
          chapters: {
            orderBy: { number: "asc" },
            include: {
              scenes: {
                orderBy: { number: "asc" },
                include: {
                  shots: { orderBy: { number: "asc" } },
                },
              },
            },
          },
        },
      },
      characters: true,
      environments: true,
      scripts: { orderBy: { createdAt: "desc" }, take: 5 },
      generationJobs: { orderBy: { createdAt: "desc" }, take: 20 },
      costRecords: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!project) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }

  return project;
}

export async function updateProject(userId: string, projectId: string, input: UpdateProjectInput) {
  const existing = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!existing) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }

  const keys = Object.keys(input);
  const budgetOnly =
    keys.length > 0 && keys.every((key) => key === "budgetLimitUsd");

  if (
    !budgetOnly &&
    existing.status !== "DRAFT" &&
    existing.status !== "PAUSED" &&
    existing.status !== "FAILED"
  ) {
    throw Object.assign(new Error("Project cannot be edited in current status"), { status: 409 });
  }

  if (existing.status === "CANCELLED") {
    throw Object.assign(new Error("Cancelled projects cannot be edited"), { status: 409 });
  }

  const targetDurationSeconds = input.targetDurationSeconds ?? existing.targetDurationSeconds;
  const resolution = input.resolution ?? existing.resolution;

  return prisma.project.update({
    where: { id: projectId },
    data: {
      ...input,
      ...(budgetOnly
        ? {}
        : {
            estimatedCostUsd: estimateVideoCostUsd(
              targetDurationSeconds,
              resolutionToPricingKey(resolution),
            ),
          }),
    },
  });
}

export async function deleteProject(userId: string, projectId: string) {
  const existing = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!existing) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }
  await prisma.project.delete({ where: { id: projectId } });
}
