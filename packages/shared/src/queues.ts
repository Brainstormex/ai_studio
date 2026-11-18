export const QUEUE = {
  STORY_GENERATION: "story-generation",
  SCRIPT_ANALYSIS: "script-analysis",
  CHARACTER_GENERATION: "character-generation",
  ENVIRONMENT_GENERATION: "environment-generation",
  STORYBOARD_GENERATION: "storyboard-generation",
  VIDEO_GENERATION: "video-generation",
  VIDEO_EXTENSION: "video-extension",
  AUDIO_GENERATION: "audio-generation",
  QUALITY_CONTROL: "quality-control",
  VIDEO_RENDERING: "video-rendering",
  EPISODE_CONTINUATION: "episode-continuation",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export type StoryGenerationJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
};

export type EpisodeContinuationJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  additionalSeconds: number;
  instruction?: string;
};

export type ScriptAnalysisJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  scriptId: string;
};

export type CharacterGenerationJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  characterIds?: string[];
  regenerate?: boolean;
};

export type EnvironmentGenerationJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  environmentIds?: string[];
  regenerate?: boolean;
};

export type StoryboardGenerationJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  regenerate?: boolean;
  episodeId?: string;
};

export type VideoGenerationJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  regenerate?: boolean;
  shotIds?: string[];
};

export type VideoExtensionJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  shotId: string;
  regenerate?: boolean;
};

export type AudioGenerationJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  regenerate?: boolean;
  forceTts?: boolean;
  shotIds?: string[];
};

export type QualityControlJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  scope?: "video" | "audio" | "all";
};

export type VideoRenderingJobData = {
  projectId: string;
  userId: string;
  jobRecordId: string;
  includeTitles?: boolean;
  burnSubtitles?: boolean;
};

