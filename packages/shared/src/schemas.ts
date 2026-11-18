import { z } from "zod";
import {
  AspectRatio,
  GenerationMode,
  Resolution,
  VisualStyle,
} from "./enums.js";

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  mode: z.nativeEnum(GenerationMode),
  topic: z.string().max(5000).optional(),
  targetDurationSeconds: z.number().int().min(30).max(7200),
  storyLanguage: z.string().min(2).max(20).default("en"),
  dialogueLanguage: z.string().min(2).max(20).default("en"),
  narrationLanguage: z.string().min(2).max(20).default("en"),
  voiceLanguage: z.string().min(2).max(20).default("en"),
  subtitleLanguage: z.string().min(2).max(20).default("en"),
  visualStyle: z.nativeEnum(VisualStyle).default(VisualStyle.CINEMATIC),
  customStyleNotes: z.string().max(2000).optional(),
  resolution: z.nativeEnum(Resolution).default(Resolution.P720),
  aspectRatio: z.nativeEnum(AspectRatio).default(AspectRatio.LANDSCAPE_16_9),
  videoProvider: z.string().min(1).max(64).default("google-omni"),
  budgetLimitUsd: z.number().positive().max(100000).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  title: z.string().min(1).max(200).optional(),
});

export const generateStorySchema = z.object({
  regenerate: z.boolean().optional().default(false),
});

export const startVideoSchema = z.object({
  regenerate: z.boolean().optional().default(false),
  shotIds: z.array(z.string().min(1)).optional(),
});

export const retryShotVideoSchema = z.object({
  regenerate: z.boolean().optional().default(true),
});

export const startAudioSchema = z.object({
  regenerate: z.boolean().optional().default(false),
  forceTts: z.boolean().optional().default(false),
  shotIds: z.array(z.string().min(1)).optional(),
});

export const retryShotAudioSchema = z.object({
  forceTts: z.boolean().optional().default(true),
});

export const runOrchestrationSchema = z.object({
  through: z
    .enum([
      "planning",
      "references",
      "storyboard",
      "video",
      "quality-control",
      "audio",
      "render",
    ])
    .optional()
    .default("quality-control"),
  forceTts: z.boolean().optional().default(false),
  regenerate: z.boolean().optional().default(false),
});

export const startRenderSchema = z.object({
  includeTitles: z.boolean().optional().default(true),
  burnSubtitles: z.boolean().optional().default(true),
});

export const continueEpisodeSchema = z.object({
  additionalSeconds: z.number().int().min(30).max(3600).default(120),
  instruction: z.string().max(4000).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type GenerateStoryInput = z.infer<typeof generateStorySchema>;
export type StartVideoInput = z.infer<typeof startVideoSchema>;
export type RetryShotVideoInput = z.infer<typeof retryShotVideoSchema>;
export type StartAudioInput = z.infer<typeof startAudioSchema>;
export type RetryShotAudioInput = z.infer<typeof retryShotAudioSchema>;
export type RunOrchestrationInput = z.infer<typeof runOrchestrationSchema>;
export type StartRenderInput = z.infer<typeof startRenderSchema>;
export type ContinueEpisodeInput = z.infer<typeof continueEpisodeSchema>;

