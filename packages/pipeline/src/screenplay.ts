import { prisma, type Prisma } from "@studio/db";
import { createLlmProviderFromEnv } from "@studio/providers";
import {
  MODEL_IDS,
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

export async function persistScreenplayStructure(
  projectId: string,
  screenplay: StructuredScreenplay,
  sourceType: string,
  rawText: string,
  existingScriptId?: string,
) {
  const existingEpisode = await prisma.episode.findFirst({
    where: { projectId, number: 1 },
  });
  if (existingEpisode) {
    await prisma.episode.delete({ where: { id: existingEpisode.id } });
  }

  await prisma.character.deleteMany({ where: { projectId } });
  await prisma.environment.deleteMany({ where: { projectId } });

  const script = existingScriptId
    ? await prisma.script.update({
        where: { id: existingScriptId },
        data: {
          sourceType,
          language: screenplay.storyLanguage,
          rawText,
          structured: screenplay as unknown as Prisma.InputJsonValue,
        },
      })
    : await prisma.script.create({
        data: {
          projectId,
          sourceType,
          language: screenplay.storyLanguage,
          rawText,
          structured: screenplay as unknown as Prisma.InputJsonValue,
        },
      });


  for (const character of screenplay.characters) {
    await prisma.character.create({
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
  }

  const environmentMap = new Map<string, string>();
  for (const location of screenplay.locations) {
    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: location.name,
        description: location.description,
        lighting: location.lighting,
        colorPalette: location.mood,
        artDirection: screenplay.visualStyleNotes,
      },
    });
    environmentMap.set(location.name.toLowerCase(), environment.id);
  }

  const episode = await prisma.episode.create({
    data: {
      projectId,
      number: 1,
      title: screenplay.title,
      summary: screenplay.storySummary,
      targetDurationSeconds: screenplay.targetDurationSeconds,
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

  await patchProjectIfActive(projectId, {
    title: screenplay.title || undefined,
    storySummary: screenplay.storySummary,
    artDirection: screenplay.visualStyleNotes,
    status: "PLANNING",
    progressPercent: 20,
  });

  return { script, episodeId: episode.id, beatSeconds: totalBeatSeconds(screenplay), screenplay };
}

export async function generateTopicScreenplay(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!project.topic) {
    throw Object.assign(new Error("Project topic is required for topic-to-video"), { status: 400 });
  }

  const llm = createLlmProviderFromEnv();
  const model = process.env.LLM_MODEL_CREATIVE ?? MODEL_IDS.llmCreative;

  const result = await llm.generate({
    model,
    temperature: 0.8,
    maxOutputTokens: 8192,
    jsonSchema: screenplayJsonSchema as unknown as Record<string, unknown>,
    messages: [
      {
        role: "system",
        content:
          "You are an autonomous film director and screenwriter. Return compact structured JSON only. No explanations.",
      },
      {
        role: "user",
        content: [
          `TOPIC: ${project.topic}`,
          `DURATION_SECONDS: ${project.targetDurationSeconds}`,
          `STORY_LANGUAGE: ${project.storyLanguage}`,
          `DIALOGUE_LANGUAGE: ${project.dialogueLanguage}`,
          `NARRATION_LANGUAGE: ${project.narrationLanguage}`,
          `VISUAL_STYLE: ${project.visualStyle}`,
          project.customStyleNotes ? `STYLE_NOTES: ${project.customStyleNotes}` : "",
          "Write a complete screenplay broken into chapters, scenes, and beats.",
          "Dialogue and narration must use the requested languages.",
          "Estimated beat durations should approximately sum to the target duration.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const parsed = structuredScreenplaySchema.parse(JSON.parse(result.text));
  await recordLlmUsage({
    projectId,
    provider: llm.name,
    model: result.model,
    operation: "topic_to_screenplay",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return persistScreenplayStructure(projectId, parsed, "topic_generated", project.topic);
}

export async function analyzeScriptToScreenplay(
  projectId: string,
  scriptText: string,
  sourceType: string,
  existingScriptId?: string,
) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const llm = createLlmProviderFromEnv();
  const model = process.env.LLM_MODEL_CHEAP ?? MODEL_IDS.llmCheap;

  const result = await llm.generate({
    model,
    temperature: 0.2,
    maxOutputTokens: 8192,
    jsonSchema: screenplayJsonSchema as unknown as Record<string, unknown>,
    messages: [
      {
        role: "system",
        content:
          "You convert scripts into structured screenplay JSON. Preserve original dialogue and narrative meaning. Do not rewrite creatively unless required for structure. Return JSON only.",
      },
      {
        role: "user",
        content: [
          `DURATION_SECONDS: ${project.targetDurationSeconds}`,
          `STORY_LANGUAGE: ${project.storyLanguage}`,
          `DIALOGUE_LANGUAGE: ${project.dialogueLanguage}`,
          `NARRATION_LANGUAGE: ${project.narrationLanguage}`,
          `VISUAL_STYLE: ${project.visualStyle}`,
          "SCRIPT_TEXT_START",
          scriptText.slice(0, 120000),
          "SCRIPT_TEXT_END",
          "Parse characters, locations, chapters, scenes, and beats.",
          "Keep original dialogue text whenever possible.",
        ].join("\n"),
      },
    ],
  });

  const parsed = structuredScreenplaySchema.parse(JSON.parse(result.text));
  await recordLlmUsage({
    projectId,
    provider: llm.name,
    model: result.model,
    operation: "script_to_screenplay",
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return persistScreenplayStructure(
    projectId,
    parsed,
    sourceType,
    scriptText,
    existingScriptId,
  );
}

