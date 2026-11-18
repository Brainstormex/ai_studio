import { z } from "zod";

export const screenplayCharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  description: z.string(),
  physicalAppearance: z.string(),
  clothing: z.string(),
  personality: z.string(),
});

export const screenplayLocationSchema = z.object({
  name: z.string(),
  description: z.string(),
  lighting: z.string(),
  mood: z.string(),
});

export const screenplayBeatSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(["action", "dialogue", "narration", "transition"]),
  character: z.string().nullable(),
  text: z.string(),
  estimatedSeconds: z.number().positive(),
});

export const screenplaySceneSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  locationName: z.string(),
  summary: z.string(),
  targetDurationSeconds: z.number().positive(),
  beats: z.array(screenplayBeatSchema).min(1),
});

export const screenplayChapterSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  targetDurationSeconds: z.number().positive(),
  scenes: z.array(screenplaySceneSchema).min(1),
});

export const structuredScreenplaySchema = z.object({
  title: z.string(),
  logline: z.string(),
  genre: z.string(),
  visualStyleNotes: z.string(),
  storySummary: z.string(),
  targetDurationSeconds: z.number().positive(),
  storyLanguage: z.string(),
  dialogueLanguage: z.string(),
  narrationLanguage: z.string(),
  characters: z.array(screenplayCharacterSchema).min(1),
  locations: z.array(screenplayLocationSchema).min(1),
  chapters: z.array(screenplayChapterSchema).min(1),
});

export type StructuredScreenplay = z.infer<typeof structuredScreenplaySchema>;
export type ScreenplayCharacter = z.infer<typeof screenplayCharacterSchema>;
export type ScreenplayLocation = z.infer<typeof screenplayLocationSchema>;

export const screenplayJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "logline",
    "genre",
    "visualStyleNotes",
    "storySummary",
    "targetDurationSeconds",
    "storyLanguage",
    "dialogueLanguage",
    "narrationLanguage",
    "characters",
    "locations",
    "chapters",
  ],
  properties: {
    title: { type: "string" },
    logline: { type: "string" },
    genre: { type: "string" },
    visualStyleNotes: { type: "string" },
    storySummary: { type: "string" },
    targetDurationSeconds: { type: "number" },
    storyLanguage: { type: "string" },
    dialogueLanguage: { type: "string" },
    narrationLanguage: { type: "string" },
    characters: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "description", "physicalAppearance", "clothing", "personality"],
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          description: { type: "string" },
          physicalAppearance: { type: "string" },
          clothing: { type: "string" },
          personality: { type: "string" },
        },
      },
    },
    locations: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "lighting", "mood"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          lighting: { type: "string" },
          mood: { type: "string" },
        },
      },
    },
    chapters: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "title", "summary", "targetDurationSeconds", "scenes"],
        properties: {
          number: { type: "integer" },
          title: { type: "string" },
          summary: { type: "string" },
          targetDurationSeconds: { type: "number" },
          scenes: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "number",
                "title",
                "locationName",
                "summary",
                "targetDurationSeconds",
                "beats",
              ],
              properties: {
                number: { type: "integer" },
                title: { type: "string" },
                locationName: { type: "string" },
                summary: { type: "string" },
                targetDurationSeconds: { type: "number" },
                beats: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["order", "type", "character", "text", "estimatedSeconds"],
                    properties: {
                      order: { type: "integer" },
                      type: {
                        type: "string",
                        enum: ["action", "dialogue", "narration", "transition"],
                      },
                      character: { type: ["string", "null"] },
                      text: { type: "string" },
                      estimatedSeconds: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
