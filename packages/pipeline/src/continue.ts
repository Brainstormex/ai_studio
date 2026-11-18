import { prisma, type Prisma } from "@studio/db";
import { createLlmProviderFromEnv } from "@studio/providers";
import {
  MODEL_IDS,
  estimateVideoCostUsd,
  screenplayJsonSchema,
  structuredScreenplaySchema,
  type StructuredScreenplay,
} from "@studio/shared";
import { patchProjectIfActive } from "./orchestration.js";
import { recordLlmUsage } from "./usage.js";

function totalBeatSeconds(screenplay: StructuredScreenplay): number {
  return screenplay.chapters.reduce(
    (chapterSum, chapter) =>
      chapterSum +
      chapter.scenes.reduce(
        (sceneSum, scene) =>
          sceneSum + scene.beats.reduce((beatSum, beat) => beatSum + beat.estimatedSeconds, 0),
        0,
      ),
    0,
  );
}

export async function persistContinuationEpisode(
  projectId: string,
  screenplay: StructuredScreenplay,
  additionalSeconds: number,
  instruction?: string,
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      characters: true,
      environments: true,
      episodes: { orderBy: { number: "desc" }, take: 1 },
    },
  });

  const nextNumber = (project.episodes[0]?.number ?? 0) + 1;
  if (nextNumber < 2) {
    throw Object.assign(new Error("Generate an initial episode before continuing the story"), {
      status: 400,
    });
  }

  const existingCharacterNames = new Set(
    project.characters.map((character) => character.name.toLowerCase()),
  );
  const existingEnvironmentNames = new Set(
    project.environments.map((environment) => environment.name.toLowerCase()),
  );

  const newCharacterIds: string[] = [];
  for (const character of screenplay.characters) {
    if (existingCharacterNames.has(character.name.toLowerCase())) continue;
    const created = await prisma.character.create({
      data: {
        projectId,
        name: character.name,
        description: character.description,
        physicalAppearance: character.physicalAppearance,
        clothing: character.clothing,
        personality: character.personality,
        relationships: { role: character.role },
      },
    });
    newCharacterIds.push(created.id);
    existingCharacterNames.add(character.name.toLowerCase());
  }

  const environmentMap = new Map(
    project.environments.map((environment) => [environment.name.toLowerCase(), environment.id]),
  );
  const newEnvironmentIds: string[] = [];
  for (const location of screenplay.locations) {
    const key = location.name.toLowerCase();
    if (environmentMap.has(key)) continue;
    if (existingEnvironmentNames.has(key)) continue;
    const created = await prisma.environment.create({
      data: {
        projectId,
        name: location.name,
        description: location.description,
        lighting: location.lighting,
        colorPalette: location.mood,
        artDirection: screenplay.visualStyleNotes,
      },
    });
    environmentMap.set(key, created.id);
    newEnvironmentIds.push(created.id);
    existingEnvironmentNames.add(key);
  }

  const script = await prisma.script.create({
    data: {
      projectId,
      sourceType: "continuation",
      language: screenplay.storyLanguage,
      rawText: [
        `EPISODE ${nextNumber} CONTINUATION`,
        instruction ? `INSTRUCTION: ${instruction}` : "",
        screenplay.storySummary,
      ]
        .filter(Boolean)
        .join("\n"),
      structured: screenplay as unknown as Prisma.InputJsonValue,
    },
  });

  const episode = await prisma.episode.create({
    data: {
      projectId,
      number: nextNumber,
      title: screenplay.title || `Episode ${nextNumber}`,
      summary: screenplay.storySummary,
      targetDurationSeconds: screenplay.targetDurationSeconds || additionalSeconds,
    },
  });

  for (const chapter of screenplay.chapters) {
    const createdChapter = await prisma.chapter.create({
      data: {
        episodeId: episode.id,
        number: chapter.number,
        title: chapter.title,
        summary: chapter.summary,
        targetDurationSeconds: chapter.targetDurationSeconds,
      },
    });

    for (const scene of chapter.scenes) {
      await prisma.scene.create({
        data: {
          chapterId: createdChapter.id,
          number: scene.number,
          title: scene.title,
          summary: scene.summary,
          locationName: scene.locationName,
          environmentId: environmentMap.get(scene.locationName.toLowerCase()),
          targetDurationSeconds: scene.targetDurationSeconds,
        },
      });
    }
  }

  const nextDuration = project.targetDurationSeconds + additionalSeconds;
  const resolutionKey =
    project.resolution === "P1080"
      ? "1080p"
      : project.resolution === "P4K"
        ? "4k"
        : "720p";

  await patchProjectIfActive(projectId, {
    storySummary: [project.storySummary, screenplay.storySummary].filter(Boolean).join("\n\n"),
    artDirection: screenplay.visualStyleNotes || project.artDirection,
    targetDurationSeconds: nextDuration,
    estimatedCostUsd: estimateVideoCostUsd(nextDuration, resolutionKey),
    status: "PLANNING",
    progressPercent: 35,
  });

  return {
    script,
    episodeId: episode.id,
    episodeNumber: nextNumber,
    beatSeconds: totalBeatSeconds(screenplay),
    newCharacterIds,
    newEnvironmentIds,
    screenplay,
  };
}

export async function continueProjectEpisode(
  projectId: string,
  options: { additionalSeconds: number; instruction?: string },
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      characters: true,
      environments: true,
      episodes: {
        orderBy: { number: "asc" },
        include: {
          chapters: {
            orderBy: { number: "asc" },
            include: {
              scenes: { orderBy: { number: "asc" } },
            },
          },
        },
      },
      scripts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (project.episodes.length === 0) {
    throw Object.assign(new Error("Generate an initial screenplay before continuing"), {
      status: 400,
    });
  }

  const previousSummary = project.episodes
    .map((episode) => {
      const sceneLines = episode.chapters
        .flatMap((chapter) =>
          chapter.scenes.map(
            (scene) =>
              `E${episode.number}C${chapter.number}S${scene.number}: ${scene.title} — ${scene.summary ?? ""}`,
          ),
        )
        .join("\n");
      return `Episode ${episode.number}: ${episode.title}\n${episode.summary ?? ""}\n${sceneLines}`;
    })
    .join("\n\n");

  const llm = createLlmProviderFromEnv();
  const model = process.env.LLM_MODEL_CREATIVE ?? MODEL_IDS.llmCreative;
  const nextEpisodeNumber = project.episodes[project.episodes.length - 1]!.number + 1;

  const result = await llm.generate({
    model,
    temperature: 0.75,
    maxOutputTokens: 8192,
    jsonSchema: screenplayJsonSchema as unknown as Record<string, unknown>,
    messages: [
      {
        role: "system",
        content:
          "You continue an existing long-form film. Reuse established characters and locations whenever possible. Return compact structured JSON for the NEXT episode only. No explanations.",
      },
      {
        role: "user",
        content: [
          "CONTINUE_EPISODE_REQUEST",
          `NEXT_EPISODE_NUMBER: ${nextEpisodeNumber}`,
          `DURATION_SECONDS: ${options.additionalSeconds}`,
          `STORY_LANGUAGE: ${project.storyLanguage}`,
          `DIALOGUE_LANGUAGE: ${project.dialogueLanguage}`,
          `NARRATION_LANGUAGE: ${project.narrationLanguage}`,
          `VISUAL_STYLE: ${project.visualStyle}`,
          project.customStyleNotes ? `STYLE_NOTES: ${project.customStyleNotes}` : "",
          project.artDirection ? `ART_DIRECTION: ${project.artDirection}` : "",
          `EXISTING_CHARACTERS: ${project.characters
            .map((character) => `${character.name}: ${character.description ?? ""}`)
            .join("; ")}`,
          `EXISTING_LOCATIONS: ${project.environments
            .map((environment) => `${environment.name}: ${environment.description ?? ""}`)
            .join("; ")}`,
          "STORY_SO_FAR_START",
          previousSummary.slice(0, 60000),
          "STORY_SO_FAR_END",
          options.instruction ? `CONTINUATION_INSTRUCTION: ${options.instruction}` : "",
          "Write the next episode as chapters/scenes/beats that continue the narrative with continuity.",
          "Prefer existing characters and locations. Only introduce new ones when necessary.",
          "Estimated beat durations should approximately sum to DURATION_SECONDS.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const parsed = structuredScreenplaySchema.parse(JSON.parse(result.text));
  parsed.targetDurationSeconds = options.additionalSeconds;

  await recordLlmUsage({
    projectId,
    provider: llm.name,
    model: result.model,
    operation: "continue_episode",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return persistContinuationEpisode(
    projectId,
    parsed,
    options.additionalSeconds,
    options.instruction,
  );
}
