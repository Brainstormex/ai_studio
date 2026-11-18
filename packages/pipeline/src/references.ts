import { prisma } from "@studio/db";
import { createImageProviderFromEnv, createStorageFromEnv } from "@studio/providers";
import { patchProjectIfActive } from "./orchestration.js";
import { recordImageUsage } from "./usage.js";

function characterPrompt(character: {
  name: string;
  description: string | null;
  physicalAppearance: string | null;
  clothing: string | null;
  personality: string | null;
  projectStyle?: string | null;
}): string {
  return [
    "Create a single character reference sheet for an AI video production.",
    "Full-body portrait, clean background, consistent identity design, no text overlays.",
    `Character name: ${character.name}`,
    character.description ? `Description: ${character.description}` : "",
    character.physicalAppearance ? `Appearance: ${character.physicalAppearance}` : "",
    character.clothing ? `Clothing: ${character.clothing}` : "",
    character.personality ? `Personality vibe: ${character.personality}` : "",
    character.projectStyle ? `Art direction: ${character.projectStyle}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function environmentPrompt(environment: {
  name: string;
  description: string | null;
  lighting: string | null;
  colorPalette: string | null;
  artDirection: string | null;
}): string {
  return [
    "Create a location/environment reference image for an AI video production.",
    "Wide establishing view, no characters, cinematic composition, no text overlays.",
    `Location: ${environment.name}`,
    environment.description ? `Description: ${environment.description}` : "",
    environment.lighting ? `Lighting: ${environment.lighting}` : "",
    environment.colorPalette ? `Palette/mood: ${environment.colorPalette}` : "",
    environment.artDirection ? `Art direction: ${environment.artDirection}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function storeReferenceImage(params: {
  projectId: string;
  kind: "character" | "environment";
  entityId: string;
  imageBytes: Buffer;
  mimeType: string;
  model: string;
}) {
  const storage = createStorageFromEnv();
  const extension = params.mimeType.includes("jpeg") ? "jpg" : "png";
  const key = `projects/${params.projectId}/${params.kind}s/${params.entityId}/${Date.now()}.${extension}`;
  const stored = await storage.putObject({
    key,
    body: params.imageBytes,
    contentType: params.mimeType,
  });

  return prisma.asset.create({
    data: {
      projectId: params.projectId,
      type: "IMAGE",
      storageKey: stored.key,
      bucket: stored.bucket,
      mimeType: params.mimeType,
      sizeBytes: params.imageBytes.length,
      width: 512,
      height: 512,
      metadata: {
        model: params.model,
        kind: params.kind,
        entityId: params.entityId,
        url: stored.url,
      },
    },
  });
}

export async function generateCharacterReferences(params: {
  projectId: string;
  characterIds?: string[];
  regenerate?: boolean;
}) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: params.projectId } });
  const characters = await prisma.character.findMany({
    where: {
      projectId: params.projectId,
      ...(params.characterIds?.length ? { id: { in: params.characterIds } } : {}),
    },
    include: { references: true },
  });

  const image = createImageProviderFromEnv();
  const created = [];

  for (const character of characters) {
    if (!params.regenerate && character.references.some((ref) => ref.isPrimary)) {
      continue;
    }

    if (params.regenerate) {
      await prisma.characterReference.deleteMany({ where: { characterId: character.id } });
    }

    const result = await image.generate({
      prompt: characterPrompt({
        ...character,
        projectStyle: project.artDirection ?? project.visualStyle,
      }),
      aspectRatio: "1:1",
    });

    const asset = await storeReferenceImage({
      projectId: params.projectId,
      kind: "character",
      entityId: character.id,
      imageBytes: result.imageBytes,
      mimeType: result.mimeType,
      model: result.model,
    });

    const reference = await prisma.characterReference.create({
      data: {
        characterId: character.id,
        assetId: asset.id,
        expression: "neutral",
        isPrimary: true,
      },
    });

    await recordImageUsage({
      projectId: params.projectId,
      provider: image.name,
      model: result.model,
      operation: "character_reference",
    });

    created.push({ characterId: character.id, referenceId: reference.id, assetId: asset.id });
  }

  return { created, skipped: characters.length - created.length };
}

export async function generateEnvironmentReferences(params: {
  projectId: string;
  environmentIds?: string[];
  regenerate?: boolean;
}) {
  const environments = await prisma.environment.findMany({
    where: {
      projectId: params.projectId,
      ...(params.environmentIds?.length ? { id: { in: params.environmentIds } } : {}),
    },
    include: { references: true },
  });

  const image = createImageProviderFromEnv();
  const created = [];

  for (const environment of environments) {
    if (!params.regenerate && environment.references.some((ref) => ref.isPrimary)) {
      continue;
    }

    if (params.regenerate) {
      await prisma.environmentReference.deleteMany({ where: { environmentId: environment.id } });
    }

    const result = await image.generate({
      prompt: environmentPrompt(environment),
      aspectRatio: "16:9",
    });

    const asset = await storeReferenceImage({
      projectId: params.projectId,
      kind: "environment",
      entityId: environment.id,
      imageBytes: result.imageBytes,
      mimeType: result.mimeType,
      model: result.model,
    });

    const reference = await prisma.environmentReference.create({
      data: {
        environmentId: environment.id,
        assetId: asset.id,
        isPrimary: true,
      },
    });

    await recordImageUsage({
      projectId: params.projectId,
      provider: image.name,
      model: result.model,
      operation: "environment_reference",
    });

    created.push({
      environmentId: environment.id,
      referenceId: reference.id,
      assetId: asset.id,
    });
  }

  return { created, skipped: environments.length - created.length };
}

export async function markReferencesProgress(projectId: string) {
  const [characters, environments] = await Promise.all([
    prisma.character.findMany({
      where: { projectId },
      include: { references: true },
    }),
    prisma.environment.findMany({
      where: { projectId },
      include: { references: true },
    }),
  ]);

  const charactersReady =
    characters.length === 0 || characters.every((item) => item.references.some((ref) => ref.isPrimary));
  const environmentsReady =
    environments.length === 0 ||
    environments.every((item) => item.references.some((ref) => ref.isPrimary));

  if (charactersReady && environmentsReady) {
    await patchProjectIfActive(projectId, {
      status: "PLANNING",
      progressPercent: 35,
    });
  }

  return { charactersReady, environmentsReady };
}
