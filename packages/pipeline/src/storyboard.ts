import { prisma, type VideoStrategy } from "@studio/db";
import { createLlmProviderFromEnv } from "@studio/providers";
import {
  MODEL_IDS,
  VIDEO_PROVIDER_CAPS,
  storyboardJsonSchema,
  storyboardPlanSchema,
  type StoryboardPlan,
  type StructuredScreenplay,
} from "@studio/shared";
import { patchProjectIfActive } from "./orchestration.js";
import { recordLlmUsage } from "./usage.js";

type SceneContext = {
  chapterNumber: number;
  sceneId: string;
  sceneNumber: number;
  title: string;
  summary: string | null;
  locationName: string | null;
  environmentId: string | null;
  targetDurationSeconds: number | null;
};

function clampDuration(seconds: number): number {
  const caps = VIDEO_PROVIDER_CAPS["google-omni"];
  return Math.max(caps.minDurationSec, Math.min(caps.maxDurationSec, Math.round(seconds)));
}

function pickStrategy(params: {
  hasCharacterRefs: boolean;
  hasEnvironmentRef: boolean;
  hasDialogue: boolean;
  shotIndex: number;
}): VideoStrategy {
  if (params.shotIndex > 0) return "EXTEND";
  if (params.hasCharacterRefs) return "REFERENCE_TO_VIDEO";
  if (params.hasEnvironmentRef) return "IMAGE_TO_VIDEO";
  if (params.hasDialogue) return "IMAGE_ANIMATION";
  return "TEXT_TO_VIDEO";
}

function buildDeterministicPlan(params: {
  projectTargetSeconds: number;
  artDirection: string;
  scenes: SceneContext[];
  screenplay: StructuredScreenplay | null;
  characterNames: string[];
  charactersWithRefs: Set<string>;
  environmentsWithRefs: Set<string>;
}): StoryboardPlan {
  const scenes = params.scenes.map((scene) => {
    const screenplayScene = params.screenplay?.chapters
      .find((chapter) => chapter.number === scene.chapterNumber)
      ?.scenes.find((item) => item.number === scene.sceneNumber);

    const beats = screenplayScene?.beats ?? [
      {
        order: 1,
        type: "action" as const,
        character: params.characterNames[0] ?? null,
        text: scene.summary || scene.title,
        estimatedSeconds: scene.targetDurationSeconds ?? 12,
      },
    ];

    const shots = beats.map((beat, index) => {
      const duration = clampDuration(beat.estimatedSeconds || 8);
      const characterNames = beat.character
        ? [beat.character]
        : params.characterNames.slice(0, 2);
      const hasCharacterRefs = characterNames.some((name) =>
        params.charactersWithRefs.has(name.toLowerCase()),
      );
      const hasEnvironmentRef = scene.locationName
        ? params.environmentsWithRefs.has(scene.locationName.toLowerCase())
        : false;

      return {
        number: index + 1,
        description: beat.text,
        compactPrompt: [
          params.artDirection,
          `Shot: ${beat.text}`,
          `Camera: ${index === 0 ? "medium establishing" : "follow action"}, slow push-in`,
          characterNames.length ? `Characters: ${characterNames.join(", ")}` : "",
          scene.locationName ? `Location: ${scene.locationName}` : "",
          beat.type === "dialogue" ? `Spoken dialogue: ${beat.text}` : "",
          beat.type === "narration" ? `Narration: ${beat.text}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        cameraAngle: index === 0 ? "medium wide" : "medium close-up",
        cameraMovement: index === 0 ? "slow push-in" : "gentle tracking",
        dialogue: beat.type === "dialogue" ? beat.text : null,
        narration: beat.type === "narration" ? beat.text : null,
        targetDurationSec: duration,
        strategy: pickStrategy({
          hasCharacterRefs,
          hasEnvironmentRef,
          hasDialogue: beat.type === "dialogue",
          shotIndex: index,
        }),
        characterNames,
        environmentName: scene.locationName,
        continuityNotes:
          index === 0
            ? "Open scene with clear geography"
            : "Continue from previous shot framing and lighting",
      };
    });

    return {
      chapterNumber: scene.chapterNumber,
      sceneNumber: scene.sceneNumber,
      shots,
    };
  });

  const plannedSeconds = scenes.reduce(
    (sum, scene) => sum + scene.shots.reduce((inner, shot) => inner + shot.targetDurationSec, 0),
    0,
  );

  return {
    totalTargetSeconds: params.projectTargetSeconds,
    plannedSeconds,
    artDirectionTokens: params.artDirection,
    scenes,
  };
}

export async function generateStoryboard(
  projectId: string,
  regenerate = false,
  options?: { episodeId?: string },
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      characters: { include: { references: true } },
      environments: { include: { references: true } },
      episodes: {
        orderBy: { number: "asc" },
        include: {
          chapters: {
            orderBy: { number: "asc" },
            include: {
              scenes: {
                orderBy: { number: "asc" },
                include: { shots: true },
              },
            },
          },
        },
      },
      scripts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const targetEpisodes = options?.episodeId
    ? project.episodes.filter((episode) => episode.id === options.episodeId)
    : project.episodes;

  if (options?.episodeId && targetEpisodes.length === 0) {
    throw Object.assign(new Error("Episode not found for storyboard planning"), { status: 404 });
  }

  const existingShots = targetEpisodes.reduce(
    (sum, episode) =>
      sum +
      episode.chapters.reduce(
        (chapterSum, chapter) =>
          chapterSum + chapter.scenes.reduce((sceneSum, scene) => sceneSum + scene.shots.length, 0),
        0,
      ),
    0,
  );

  if (!regenerate && existingShots > 0) {
    return {
      createdShots: 0,
      plannedSeconds: 0,
      reused: true,
      existingShots,
      episodeId: options?.episodeId ?? null,
    };
  }

  if (regenerate) {
    await prisma.shot.deleteMany({
      where: options?.episodeId
        ? { scene: { chapter: { episodeId: options.episodeId } } }
        : { scene: { chapter: { episode: { projectId } } } },
    });
  }

  const allScenes: SceneContext[] = [];
  for (const episode of targetEpisodes) {
    for (const chapter of episode.chapters) {
      for (const scene of chapter.scenes) {
        allScenes.push({
          chapterNumber: chapter.number,
          sceneId: scene.id,
          sceneNumber: scene.number,
          title: scene.title,
          summary: scene.summary,
          locationName: scene.locationName,
          environmentId: scene.environmentId,
          targetDurationSeconds: scene.targetDurationSeconds,
        });
      }
    }
  }

  if (allScenes.length === 0) {
    throw Object.assign(new Error("No scenes available for storyboard planning"), { status: 400 });
  }

  const screenplay = (project.scripts[0]?.structured as StructuredScreenplay | null) ?? null;
  const charactersWithRefs = new Set(
    project.characters
      .filter((character) => character.references.some((ref) => ref.isPrimary))
      .map((character) => character.name.toLowerCase()),
  );
  const environmentsWithRefs = new Set(
    project.environments
      .filter((environment) => environment.references.some((ref) => ref.isPrimary))
      .map((environment) => environment.name.toLowerCase()),
  );

  const artDirection =
    project.artDirection ||
    `${project.visualStyle} visual style, consistent character identity, cinematic continuity`;

  const compactSceneBrief = allScenes.map((scene) => ({
    chapterNumber: scene.chapterNumber,
    sceneNumber: scene.sceneNumber,
    title: scene.title,
    summary: scene.summary,
    locationName: scene.locationName,
    targetDurationSeconds: scene.targetDurationSeconds,
    beats:
      screenplay?.chapters
        .find((chapter) => chapter.number === scene.chapterNumber)
        ?.scenes.find((item) => item.number === scene.sceneNumber)?.beats ?? [],
  }));

  const llm = createLlmProviderFromEnv();
  let plan: StoryboardPlan =
    buildDeterministicPlan({
      projectTargetSeconds: project.targetDurationSeconds,
      artDirection,
      scenes: allScenes,
      screenplay,
      characterNames: project.characters.map((character) => character.name),
      charactersWithRefs,
      environmentsWithRefs,
    });

  try {
    const model = process.env.LLM_MODEL_CREATIVE ?? MODEL_IDS.llmCreative;
    const result = await llm.generate({
      model,
      temperature: 0.4,
      maxOutputTokens: 8192,
      jsonSchema: storyboardJsonSchema as unknown as Record<string, unknown>,
      messages: [
        {
          role: "system",
          content:
            "You are an autonomous AI Director. Create a compact shot plan only. Prefer 8-12s shots (3-15s hard limit). Choose strategy from TEXT_TO_VIDEO, IMAGE_TO_VIDEO, REFERENCE_TO_VIDEO, FIRST_LAST_FRAME, EXTEND, REUSE, IMAGE_ANIMATION. Use REFERENCE_TO_VIDEO when character refs exist, EXTEND for continuity after the first shot in a scene, IMAGE_ANIMATION for dialogue-heavy static moments. Never include the full screenplay in compactPrompt—only shot-specific instructions.",
        },
        {
          role: "user",
          content: [
            `STORYBOARD_REQUEST`,
            `DURATION_SECONDS: ${project.targetDurationSeconds}`,
            `VISUAL_STYLE: ${project.visualStyle}`,
            `ART_DIRECTION: ${artDirection}`,
            `STORY_SUMMARY: ${project.storySummary ?? ""}`,
            `CHARACTERS: ${project.characters
              .map(
                (character) =>
                  `${character.name}${charactersWithRefs.has(character.name.toLowerCase()) ? " [ref]" : ""}`,
              )
              .join("; ")}`,
            `ENVIRONMENTS: ${project.environments
              .map(
                (environment) =>
                  `${environment.name}${environmentsWithRefs.has(environment.name.toLowerCase()) ? " [ref]" : ""}`,
              )
              .join("; ")}`,
            `SCENES_JSON: ${JSON.stringify(compactSceneBrief)}`,
            "Return shot plans for every scene. Durations should approximately sum to target duration.",
          ].join("\n"),
        },
      ],
    });

    const parsedPlan = storyboardPlanSchema.parse(JSON.parse(result.text));
    plan = parsedPlan;
    await recordLlmUsage({
      projectId,
      provider: llm.name,
      model: result.model,
      operation: "storyboard_plan",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch {
    // keep deterministic plan
  }

  const characterByName = new Map<string, string>(
    project.characters.map((character) => [character.name.toLowerCase(), character.id]),
  );
  const sceneByKey = new Map<string, SceneContext>(
    allScenes.map((scene) => [`${scene.chapterNumber}:${scene.sceneNumber}`, scene]),
  );

  let createdShots = 0;
  const shotIds: string[] = [];

  let previousId: string | null = null;
  if (options?.episodeId) {
    const priorShot = await prisma.shot.findFirst({
      where: {
        scene: {
          chapter: {
            episode: {
              projectId,
              id: { not: options.episodeId },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    previousId = priorShot?.id ?? null;
  }

  for (const plannedScene of plan.scenes) {
    const sceneContext = sceneByKey.get(
      `${plannedScene.chapterNumber}:${plannedScene.sceneNumber}`,
    );
    if (!sceneContext) continue;

    for (const plannedShot of plannedScene.shots) {
      const characterIds: string[] = plannedShot.characterNames
        .map((name) => characterByName.get(name.toLowerCase()))
        .filter((id): id is string => Boolean(id));

      const row = await prisma.shot.create({
        data: {
          sceneId: sceneContext.sceneId,
          number: plannedShot.number,
          description: plannedShot.description,
          compactPrompt: plannedShot.compactPrompt,
          cameraAngle: plannedShot.cameraAngle,
          cameraMovement: plannedShot.cameraMovement,
          dialogue: plannedShot.dialogue,
          narration: plannedShot.narration,
          targetDurationSec: clampDuration(plannedShot.targetDurationSec),
          strategy: plannedShot.strategy as VideoStrategy,
          status: "PENDING",
          characterIds,
          previousShotId: previousId,
          continuityNotes: plannedShot.continuityNotes,
        },
        select: { id: true },
      });

      previousId = row.id;
      shotIds.push(row.id);
      createdShots += 1;
    }
  }

  await patchProjectIfActive(projectId, {
    status: "PLANNING",
    progressPercent: 50,
    artDirection: plan.artDirectionTokens || artDirection,
  });

  return {
    createdShots,
    plannedSeconds: plan.plannedSeconds,
    reused: false,
    artDirectionTokens: plan.artDirectionTokens,
    episodeId: options?.episodeId ?? null,
  };
}
