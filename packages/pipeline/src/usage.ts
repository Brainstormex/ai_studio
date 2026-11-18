import { prisma } from "@studio/db";
import {
  DEFAULT_PRICING,
  estimateImageCostUsd,
  estimateLlmCostUsd,
  estimateTtsCostUsd,
  estimateVideoCostUsd,
} from "@studio/shared";

async function attachCost(params: {
  projectId: string;
  usageId: string;
  estimatedUsd: number;
}) {
  await prisma.costRecord.create({
    data: {
      projectId: params.projectId,
      usageRecordId: params.usageId,
      pricingVersion: DEFAULT_PRICING.version,
      estimatedUsd: params.estimatedUsd,
      actualUsd: params.estimatedUsd,
    },
  });

  await prisma.project.update({
    where: { id: params.projectId },
    data: {
      actualCostUsd: {
        increment: params.estimatedUsd,
      },
    },
  });
}

export async function recordLlmUsage(params: {
  projectId: string;
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const usage = await prisma.usageRecord.create({
    data: {
      projectId: params.projectId,
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    },
  });

  const modelKey = params.model.includes("pro") ? "gemini-2.5-pro" : "gemini-2.5-flash";
  const estimatedUsd = estimateLlmCostUsd(
    modelKey as keyof typeof DEFAULT_PRICING.llm,
    params.inputTokens,
    params.outputTokens,
  );

  await attachCost({
    projectId: params.projectId,
    usageId: usage.id,
    estimatedUsd,
  });

  return { usage, estimatedUsd };
}

export async function recordImageUsage(params: {
  projectId: string;
  provider: string;
  model: string;
  operation: string;
  imageCount?: number;
}) {
  const imageCount = params.imageCount ?? 1;
  const usage = await prisma.usageRecord.create({
    data: {
      projectId: params.projectId,
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      imageCount,
    },
  });

  const estimatedUsd = estimateImageCostUsd(imageCount);
  await attachCost({
    projectId: params.projectId,
    usageId: usage.id,
    estimatedUsd,
  });

  return { usage, estimatedUsd };
}

export async function recordVideoUsage(params: {
  projectId: string;
  provider: string;
  model: string;
  operation: string;
  durationSeconds: number;
  resolution?: "360p" | "720p" | "1080p" | "4k";
}) {
  const usage = await prisma.usageRecord.create({
    data: {
      projectId: params.projectId,
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      videoSeconds: params.durationSeconds,
    },
  });

  const estimatedUsd = estimateVideoCostUsd(
    params.durationSeconds,
    params.resolution ?? "720p",
  );
  await attachCost({
    projectId: params.projectId,
    usageId: usage.id,
    estimatedUsd,
  });

  return { usage, estimatedUsd };
}

export async function recordTtsUsage(params: {
  projectId: string;
  provider: string;
  model: string;
  operation: string;
  audioChars: number;
}) {
  const usage = await prisma.usageRecord.create({
    data: {
      projectId: params.projectId,
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      audioChars: params.audioChars,
    },
  });

  const estimatedUsd = estimateTtsCostUsd(params.audioChars);
  await attachCost({
    projectId: params.projectId,
    usageId: usage.id,
    estimatedUsd,
  });

  return { usage, estimatedUsd };
}

