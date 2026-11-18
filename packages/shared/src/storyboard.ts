import { z } from "zod";
import { VideoStrategy } from "./enums.js";

export const plannedShotSchema = z.object({
  number: z.number().int().positive(),
  description: z.string(),
  compactPrompt: z.string(),
  cameraAngle: z.string(),
  cameraMovement: z.string(),
  dialogue: z.string().nullable(),
  narration: z.string().nullable(),
  targetDurationSec: z.number().int().min(3).max(15),
  strategy: z.nativeEnum(VideoStrategy),
  characterNames: z.array(z.string()),
  environmentName: z.string().nullable(),
  continuityNotes: z.string().nullable(),
});

export const plannedSceneSchema = z.object({
  chapterNumber: z.number().int().positive(),
  sceneNumber: z.number().int().positive(),
  shots: z.array(plannedShotSchema).min(1),
});

export const storyboardPlanSchema = z.object({
  totalTargetSeconds: z.number().positive(),
  plannedSeconds: z.number().positive(),
  artDirectionTokens: z.string(),
  scenes: z.array(plannedSceneSchema).min(1),
});

export type PlannedShot = z.infer<typeof plannedShotSchema>;
export type StoryboardPlan = z.infer<typeof storyboardPlanSchema>;

export const storyboardJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["totalTargetSeconds", "plannedSeconds", "artDirectionTokens", "scenes"],
  properties: {
    totalTargetSeconds: { type: "number" },
    plannedSeconds: { type: "number" },
    artDirectionTokens: { type: "string" },
    scenes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chapterNumber", "sceneNumber", "shots"],
        properties: {
          chapterNumber: { type: "integer" },
          sceneNumber: { type: "integer" },
          shots: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "number",
                "description",
                "compactPrompt",
                "cameraAngle",
                "cameraMovement",
                "dialogue",
                "narration",
                "targetDurationSec",
                "strategy",
                "characterNames",
                "environmentName",
                "continuityNotes",
              ],
              properties: {
                number: { type: "integer" },
                description: { type: "string" },
                compactPrompt: { type: "string" },
                cameraAngle: { type: "string" },
                cameraMovement: { type: "string" },
                dialogue: { type: ["string", "null"] },
                narration: { type: ["string", "null"] },
                targetDurationSec: { type: "integer", minimum: 3, maximum: 15 },
                strategy: {
                  type: "string",
                  enum: Object.values(VideoStrategy),
                },
                characterNames: { type: "array", items: { type: "string" } },
                environmentName: { type: ["string", "null"] },
                continuityNotes: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;
