export const GenerationMode = {
  TOPIC_TO_VIDEO: "TOPIC_TO_VIDEO",
  SCRIPT_TO_VIDEO: "SCRIPT_TO_VIDEO",
  VIDEO_REFERENCE: "VIDEO_REFERENCE",
} as const;
export type GenerationMode = (typeof GenerationMode)[keyof typeof GenerationMode];

export const VisualStyle = {
  CINEMATIC: "CINEMATIC",
  ANIMATION_2D: "ANIMATION_2D",
  ANIMATION_3D: "ANIMATION_3D",
  REALISTIC: "REALISTIC",
  DOCUMENTARY: "DOCUMENTARY",
  EDUCATIONAL: "EDUCATIONAL",
  CARTOON: "CARTOON",
  ANIME: "ANIME",
  EXPLAINER: "EXPLAINER",
  CUSTOM: "CUSTOM",
} as const;
export type VisualStyle = (typeof VisualStyle)[keyof typeof VisualStyle];

export const Resolution = {
  P720: "P720",
  P1080: "P1080",
  P4K: "P4K",
} as const;
export type Resolution = (typeof Resolution)[keyof typeof Resolution];

export const AspectRatio = {
  LANDSCAPE_16_9: "LANDSCAPE_16_9",
  PORTRAIT_9_16: "PORTRAIT_9_16",
} as const;
export type AspectRatio = (typeof AspectRatio)[keyof typeof AspectRatio];

export const ProjectStatus = {
  DRAFT: "DRAFT",
  PLANNING: "PLANNING",
  GENERATING: "GENERATING",
  PAUSED: "PAUSED",
  RENDERING: "RENDERING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const SegmentStatus = {
  PENDING: "PENDING",
  QUEUED: "QUEUED",
  GENERATING: "GENERATING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type SegmentStatus = (typeof SegmentStatus)[keyof typeof SegmentStatus];

export const JobStatus = {
  PENDING: "PENDING",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobType = {
  STORY_GENERATION: "STORY_GENERATION",
  SCRIPT_ANALYSIS: "SCRIPT_ANALYSIS",
  CHARACTER_GENERATION: "CHARACTER_GENERATION",
  ENVIRONMENT_GENERATION: "ENVIRONMENT_GENERATION",
  STORYBOARD_GENERATION: "STORYBOARD_GENERATION",
  VIDEO_GENERATION: "VIDEO_GENERATION",
  VIDEO_EXTENSION: "VIDEO_EXTENSION",
  AUDIO_GENERATION: "AUDIO_GENERATION",
  QUALITY_CONTROL: "QUALITY_CONTROL",
  VIDEO_RENDERING: "VIDEO_RENDERING",
  EPISODE_CONTINUATION: "EPISODE_CONTINUATION",
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const AssetType = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  AUDIO: "AUDIO",
  SUBTITLE: "SUBTITLE",
  DOCUMENT: "DOCUMENT",
  OTHER: "OTHER",
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const VideoStrategy = {
  TEXT_TO_VIDEO: "TEXT_TO_VIDEO",
  IMAGE_TO_VIDEO: "IMAGE_TO_VIDEO",
  REFERENCE_TO_VIDEO: "REFERENCE_TO_VIDEO",
  FIRST_LAST_FRAME: "FIRST_LAST_FRAME",
  EXTEND: "EXTEND",
  REUSE: "REUSE",
  IMAGE_ANIMATION: "IMAGE_ANIMATION",
} as const;
export type VideoStrategy = (typeof VideoStrategy)[keyof typeof VideoStrategy];

export const AudioSource = {
  NATIVE_VIDEO: "NATIVE_VIDEO",
  CLOUD_TTS: "CLOUD_TTS",
  GEMINI_TTS: "GEMINI_TTS",
  UPLOADED: "UPLOADED",
  NONE: "NONE",
} as const;
export type AudioSource = (typeof AudioSource)[keyof typeof AudioSource];
