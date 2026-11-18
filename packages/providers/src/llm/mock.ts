import type { LlmGenerateInput, LlmGenerateResult, LlmProvider } from "../types.js";
import type { StoryboardPlan, StructuredScreenplay } from "@studio/shared";
import { VideoStrategy } from "@studio/shared";

function buildMockScreenplay(topic: string, durationSeconds: number, language: string): StructuredScreenplay {
  const chapterCount = Math.max(1, Math.min(6, Math.ceil(durationSeconds / 300)));
  const chapterDuration = Math.floor(durationSeconds / chapterCount);
  const chapters = Array.from({ length: chapterCount }, (_, chapterIndex) => {
    const sceneCount = Math.max(2, Math.min(4, Math.ceil(chapterDuration / 90)));
    const sceneDuration = Math.floor(chapterDuration / sceneCount);
    return {
      number: chapterIndex + 1,
      title: `Chapter ${chapterIndex + 1}`,
      summary: `Story progression for chapter ${chapterIndex + 1} of: ${topic}`,
      targetDurationSeconds: chapterDuration,
      scenes: Array.from({ length: sceneCount }, (_, sceneIndex) => ({
        number: sceneIndex + 1,
        title: `Scene ${sceneIndex + 1}`,
        locationName: sceneIndex % 2 === 0 ? "Forest Clearing" : "Hidden Cottage",
        summary: `Scene ${sceneIndex + 1} advances the story.`,
        targetDurationSeconds: sceneDuration,
        beats: [
          {
            order: 1,
            type: "narration" as const,
            character: null,
            text: `In chapter ${chapterIndex + 1}, scene ${sceneIndex + 1}, the adventure continues.`,
            estimatedSeconds: Math.max(8, Math.floor(sceneDuration * 0.4)),
          },
          {
            order: 2,
            type: "dialogue" as const,
            character: "Mira",
            text: "We should keep going before the light fades.",
            estimatedSeconds: Math.max(6, Math.floor(sceneDuration * 0.3)),
          },
          {
            order: 3,
            type: "action" as const,
            character: "Mira",
            text: "Mira steps forward and studies the glowing path ahead.",
            estimatedSeconds: Math.max(6, Math.floor(sceneDuration * 0.3)),
          },
        ],
      })),
    };
  });

  return {
    title: topic.slice(0, 80) || "Untitled Adventure",
    logline: `An adventure inspired by: ${topic}`,
    genre: "animated adventure",
    visualStyleNotes: "Warm animated adventure with consistent character design.",
    storySummary: `A complete story developed from the topic: ${topic}`,
    targetDurationSeconds: durationSeconds,
    storyLanguage: language,
    dialogueLanguage: language,
    narrationLanguage: language,
    characters: [
      {
        name: "Mira",
        role: "protagonist",
        description: "Curious young explorer",
        physicalAppearance: "Small frame, bright eyes, short dark hair",
        clothing: "Orange scarf and travel jacket",
        personality: "Brave, kind, curious",
      },
      {
        name: "Pip",
        role: "companion",
        description: "Talkative woodland guide",
        physicalAppearance: "Tiny fox-like creature with soft fur",
        clothing: "Leaf-green vest",
        personality: "Witty and loyal",
      },
    ],
    locations: [
      {
        name: "Forest Clearing",
        description: "Sunlit clearing surrounded by ancient trees",
        lighting: "Golden afternoon light",
        mood: "Wonder",
      },
      {
        name: "Hidden Cottage",
        description: "Moss-covered cottage tucked between roots",
        lighting: "Warm lantern glow",
        mood: "Safe and mysterious",
      },
    ],
    chapters,
  };
}

function buildMockStoryboard(userText: string): StoryboardPlan {
  const durationMatch = /DURATION_SECONDS:\s*(\d+)/i.exec(userText);
  const scenesMatch = /SCENES_JSON:\s*(\[[\s\S]*\])/i.exec(userText);
  const durationSeconds = Number(durationMatch?.[1] ?? 180);
  let scenesInput: Array<{
    chapterNumber: number;
    sceneNumber: number;
    title: string;
    summary?: string | null;
    locationName?: string | null;
    beats?: Array<{ text: string; type: string; character: string | null; estimatedSeconds: number }>;
  }> = [];

  if (scenesMatch?.[1]) {
    try {
      scenesInput = JSON.parse(scenesMatch[1]);
    } catch {
      scenesInput = [];
    }
  }

  if (scenesInput.length === 0) {
    scenesInput = [
      {
        chapterNumber: 1,
        sceneNumber: 1,
        title: "Opening",
        locationName: "Forest Clearing",
        beats: [
          {
            text: "The heroes enter the forest.",
            type: "action",
            character: "Mira",
            estimatedSeconds: 10,
          },
        ],
      },
    ];
  }

  const scenes = scenesInput.map((scene) => {
    const beats =
      scene.beats && scene.beats.length > 0
        ? scene.beats
        : [
            {
              text: scene.summary || scene.title,
              type: "action",
              character: "Mira",
              estimatedSeconds: 10,
            },
          ];

    return {
      chapterNumber: scene.chapterNumber,
      sceneNumber: scene.sceneNumber,
      shots: beats.map((beat, index) => ({
        number: index + 1,
        description: beat.text,
        compactPrompt: `Animated adventure | ${beat.text} | Camera: medium, slow push-in | Location: ${scene.locationName ?? "unknown"}`,
        cameraAngle: index === 0 ? "medium wide" : "medium close-up",
        cameraMovement: index === 0 ? "slow push-in" : "gentle tracking",
        dialogue: beat.type === "dialogue" ? beat.text : null,
        narration: beat.type === "narration" ? beat.text : null,
        targetDurationSec: Math.max(3, Math.min(15, Math.round(beat.estimatedSeconds || 8))),
        strategy:
          index > 0
            ? VideoStrategy.EXTEND
            : beat.type === "dialogue"
              ? VideoStrategy.IMAGE_ANIMATION
              : VideoStrategy.REFERENCE_TO_VIDEO,
        characterNames: beat.character ? [beat.character] : ["Mira"],
        environmentName: scene.locationName ?? null,
        continuityNotes: index === 0 ? "Establish location" : "Continue previous shot",
      })),
    };
  });

  const plannedSeconds = scenes.reduce(
    (sum, scene) => sum + scene.shots.reduce((inner, shot) => inner + shot.targetDurationSec, 0),
    0,
  );

  return {
    totalTargetSeconds: durationSeconds,
    plannedSeconds,
    artDirectionTokens: "warm animated adventure, consistent character design",
    scenes,
  };
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock-llm";

  async generate(input: LlmGenerateInput): Promise<LlmGenerateResult> {
    const userText = input.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    if (input.jsonSchema) {
      if (/STORYBOARD_REQUEST/i.test(userText)) {
        const text = JSON.stringify(buildMockStoryboard(userText));
        return {
          text,
          inputTokens: Math.ceil(userText.length / 4),
          outputTokens: Math.ceil(text.length / 4),
          model: input.model,
        };
      }

      const topicMatch = /TOPIC:\s*(.+)/i.exec(userText);
      const durationMatch = /DURATION_SECONDS:\s*(\d+)/i.exec(userText);
      const languageMatch = /STORY_LANGUAGE:\s*([a-z-]+)/i.exec(userText);
      const scriptMatch = /SCRIPT_TEXT_START([\s\S]*?)SCRIPT_TEXT_END/i.exec(userText);
      const continueMatch = /CONTINUE_EPISODE_REQUEST/i.test(userText);
      const episodeMatch = /NEXT_EPISODE_NUMBER:\s*(\d+)/i.exec(userText);

      const topic = continueMatch
        ? `Continuation of episode ${episodeMatch?.[1] ?? "2"}`
        : topicMatch?.[1]?.trim() || scriptMatch?.[1]?.slice(0, 120).trim() || "Untitled story";
      const durationSeconds = Number(durationMatch?.[1] ?? 300);
      const language = languageMatch?.[1] ?? "en";
      const screenplay = buildMockScreenplay(topic, durationSeconds, language);
      if (continueMatch) {
        screenplay.title = `Episode ${episodeMatch?.[1] ?? "2"}`;
        screenplay.logline = "The adventure continues with established characters.";
        screenplay.storySummary = `Next episode continues the prior story${
          /CONTINUATION_INSTRUCTION:\s*(.+)/i.exec(userText)?.[1]
            ? ` — ${/CONTINUATION_INSTRUCTION:\s*(.+)/i.exec(userText)?.[1]?.trim()}`
            : ""
        }.`;
      }

      if (scriptMatch?.[1]) {
        screenplay.storySummary = `Normalized from uploaded script while preserving narrative intent.`;
        screenplay.logline = "Structured screenplay derived from source script.";
        const excerpt = scriptMatch[1].trim().slice(0, 280);
        if (screenplay.chapters[0]?.scenes[0]?.beats[0]) {
          screenplay.chapters[0].scenes[0].beats[0].text =
            excerpt || screenplay.chapters[0].scenes[0].beats[0].text;
        }
      }

      const text = JSON.stringify(screenplay);
      return {
        text,
        inputTokens: Math.ceil(userText.length / 4),
        outputTokens: Math.ceil(text.length / 4),
        model: input.model,
      };
    }

    const text = JSON.stringify({ summary: userText.slice(0, 400) });
    return {
      text,
      inputTokens: Math.ceil(userText.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      model: input.model,
    };
  }
}
