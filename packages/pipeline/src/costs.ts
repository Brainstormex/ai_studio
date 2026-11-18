import { prisma } from "@studio/db";
import { getBudgetSnapshot } from "./budget.js";

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function getProjectCosts(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      estimatedCostUsd: true,
      actualCostUsd: true,
      budgetLimitUsd: true,
      targetDurationSeconds: true,
      resolution: true,
    },
  });
  const budget = await getBudgetSnapshot(projectId);

  const [usageRecords, costRecords] = await Promise.all([
    prisma.usageRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.costRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const costByUsageId = new Map(
    costRecords
      .filter((record) => record.usageRecordId)
      .map((record) => [record.usageRecordId as string, record]),
  );

  const byProvider = new Map<
    string,
    {
      provider: string;
      estimatedUsd: number;
      actualUsd: number;
      inputTokens: number;
      outputTokens: number;
      videoSeconds: number;
      imageCount: number;
      audioChars: number;
      operations: number;
    }
  >();

  const byOperation = new Map<
    string,
    {
      operation: string;
      provider: string;
      estimatedUsd: number;
      actualUsd: number;
      inputTokens: number;
      outputTokens: number;
      videoSeconds: number;
      imageCount: number;
      audioChars: number;
      count: number;
    }
  >();

  for (const usage of usageRecords) {
    const cost = costByUsageId.get(usage.id);
    const estimatedUsd = Number(cost?.estimatedUsd ?? 0);
    const actualUsd = Number(cost?.actualUsd ?? cost?.estimatedUsd ?? 0);

    const providerRow = byProvider.get(usage.provider) ?? {
      provider: usage.provider,
      estimatedUsd: 0,
      actualUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      videoSeconds: 0,
      imageCount: 0,
      audioChars: 0,
      operations: 0,
    };
    providerRow.estimatedUsd += estimatedUsd;
    providerRow.actualUsd += actualUsd;
    providerRow.inputTokens += usage.inputTokens;
    providerRow.outputTokens += usage.outputTokens;
    providerRow.videoSeconds += usage.videoSeconds;
    providerRow.imageCount += usage.imageCount;
    providerRow.audioChars += usage.audioChars;
    providerRow.operations += 1;
    byProvider.set(usage.provider, providerRow);

    const opKey = `${usage.provider}:${usage.operation}`;
    const operationRow = byOperation.get(opKey) ?? {
      operation: usage.operation,
      provider: usage.provider,
      estimatedUsd: 0,
      actualUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      videoSeconds: 0,
      imageCount: 0,
      audioChars: 0,
      count: 0,
    };
    operationRow.estimatedUsd += estimatedUsd;
    operationRow.actualUsd += actualUsd;
    operationRow.inputTokens += usage.inputTokens;
    operationRow.outputTokens += usage.outputTokens;
    operationRow.videoSeconds += usage.videoSeconds;
    operationRow.imageCount += usage.imageCount;
    operationRow.audioChars += usage.audioChars;
    operationRow.count += 1;
    byOperation.set(opKey, operationRow);
  }

  const totals = {
    estimatedUsd: roundUsd(Number(project.estimatedCostUsd ?? 0)),
    actualUsd: roundUsd(Number(project.actualCostUsd ?? 0)),
    budgetLimitUsd:
      project.budgetLimitUsd == null ? null : roundUsd(Number(project.budgetLimitUsd)),
    usageEstimatedUsd: roundUsd(
      [...byProvider.values()].reduce((sum, row) => sum + row.estimatedUsd, 0),
    ),
    usageActualUsd: roundUsd(
      [...byProvider.values()].reduce((sum, row) => sum + row.actualUsd, 0),
    ),
    inputTokens: usageRecords.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: usageRecords.reduce((sum, row) => sum + row.outputTokens, 0),
    videoSeconds: usageRecords.reduce((sum, row) => sum + row.videoSeconds, 0),
    imageCount: usageRecords.reduce((sum, row) => sum + row.imageCount, 0),
    audioChars: usageRecords.reduce((sum, row) => sum + row.audioChars, 0),
    recordCount: usageRecords.length,
  };

  return {
    project: {
      id: project.id,
      targetDurationSeconds: project.targetDurationSeconds,
      resolution: project.resolution,
      estimatedCostUsd: totals.estimatedUsd,
      actualCostUsd: totals.actualUsd,
      budgetLimitUsd: totals.budgetLimitUsd,
    },
    budget: {
      remainingUsd: budget.remainingUsd == null ? null : roundUsd(budget.remainingUsd),
      pendingVideoSeconds: budget.pendingVideoSeconds,
      pendingVideoEstimateUsd: roundUsd(budget.pendingVideoEstimateUsd),
      projectedUsd: roundUsd(budget.projectedUsd),
      overBudget: budget.overBudget,
    },
    totals,
    byProvider: [...byProvider.values()]
      .map((row) => ({
        ...row,
        estimatedUsd: roundUsd(row.estimatedUsd),
        actualUsd: roundUsd(row.actualUsd),
      }))
      .sort((a, b) => b.actualUsd - a.actualUsd),
    byOperation: [...byOperation.values()]
      .map((row) => ({
        ...row,
        estimatedUsd: roundUsd(row.estimatedUsd),
        actualUsd: roundUsd(row.actualUsd),
      }))
      .sort((a, b) => b.actualUsd - a.actualUsd),
    recent: usageRecords.slice(0, 40).map((usage) => {
      const cost = costByUsageId.get(usage.id);
      return {
        id: usage.id,
        provider: usage.provider,
        model: usage.model,
        operation: usage.operation,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        videoSeconds: usage.videoSeconds,
        imageCount: usage.imageCount,
        audioChars: usage.audioChars,
        estimatedUsd: roundUsd(Number(cost?.estimatedUsd ?? 0)),
        actualUsd: roundUsd(Number(cost?.actualUsd ?? cost?.estimatedUsd ?? 0)),
        createdAt: usage.createdAt,
      };
    }),
  };
}
