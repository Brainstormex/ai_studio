const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type AuthSession = {
  user: { id: string; email: string; name: string };
  accessToken: string;
  refreshToken: string;
};

const TOKEN_KEY = "studio.accessToken";
const REFRESH_KEY = "studio.refreshToken";
const USER_KEY = "studio.user";

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const accessToken = localStorage.getItem(TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!accessToken || !refreshToken || !userRaw) return null;
  return {
    accessToken,
    refreshToken,
    user: JSON.parse(userRaw),
  };
}

export function storeSession(session: AuthSession): void {
  localStorage.setItem(TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  auth = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (auth) {
    const session = getStoredSession();
    if (session?.accessToken) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export const api = {
  register: (body: { email: string; password: string; name: string }) =>
    apiFetch<AuthSession>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    apiFetch<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => apiFetch<{ user: AuthSession["user"] }>("/auth/me", {}, true),
  logout: async () => {
    const session = getStoredSession();
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: session?.refreshToken }),
    }).catch(() => undefined);
    clearSession();
  },
  listProjects: () =>
    apiFetch<{ projects: ProjectSummary[] }>("/projects", {}, true),
  createProject: (body: CreateProjectBody) =>
    apiFetch<{ project: ProjectSummary }>("/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }, true),
  getProject: (id: string) =>
    apiFetch<{ project: ProjectDetail }>(`/projects/${id}`, {}, true),
  health: () => apiFetch<HealthResponse>("/health"),
  generateStory: (projectId: string, regenerate = false) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/generation/story`, {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    }, true),
  uploadScript: async (projectId: string, file?: File, scriptText?: string) => {
    const session = getStoredSession();
    const form = new FormData();
    if (file) form.append("file", file);
    if (scriptText) form.append("scriptText", scriptText);
    const response = await fetch(`${API_URL}/projects/${projectId}/generation/script`, {
      method: "POST",
      headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Script upload failed");
    return data as { job: GenerationJob; script: { id: string; sourceType: string } };
  },
  getJobs: (projectId: string) =>
    apiFetch<{ jobs: GenerationJob[] }>(`/projects/${projectId}/generation/jobs`, {}, true),
  getScreenplay: (projectId: string) =>
    apiFetch<ScreenplayResponse>(`/projects/${projectId}/generation/screenplay`, {}, true),
  getReferences: (projectId: string) =>
    apiFetch<ReferencesResponse>(`/projects/${projectId}/references`, {}, true),
  generateCharacterRefs: (projectId: string, regenerate = true) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/references/characters/generate`, {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    }, true),
  generateEnvironmentRefs: (projectId: string, regenerate = true) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/references/environments/generate`, {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    }, true),
  getStoryboard: (projectId: string) =>
    apiFetch<StoryboardResponse>(`/projects/${projectId}/storyboard`, {}, true),
  generateStoryboard: (projectId: string, regenerate = true) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/storyboard/generate`, {
      method: "POST",
      body: JSON.stringify({ regenerate }),
    }, true),
  getVideoStatus: (projectId: string) =>
    apiFetch<VideoStatusResponse>(`/projects/${projectId}/video/status`, {}, true),
  startVideo: (projectId: string, regenerate = false, shotIds?: string[]) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/video/start`, {
      method: "POST",
      body: JSON.stringify({ regenerate, shotIds }),
    }, true),
  retryShotVideo: (projectId: string, shotId: string) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/video/shots/${shotId}/retry`, {
      method: "POST",
      body: JSON.stringify({ regenerate: true }),
    }, true),
  getAudioStatus: (projectId: string) =>
    apiFetch<AudioStatusResponse>(`/projects/${projectId}/audio/status`, {}, true),
  startAudio: (projectId: string, options?: { regenerate?: boolean; forceTts?: boolean }) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/audio/start`, {
      method: "POST",
      body: JSON.stringify({
        regenerate: options?.regenerate ?? false,
        forceTts: options?.forceTts ?? false,
      }),
    }, true),
  retryShotAudio: (projectId: string, shotId: string, forceTts = true) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/audio/shots/${shotId}/retry`, {
      method: "POST",
      body: JSON.stringify({ forceTts }),
    }, true),
  getOrchestration: (projectId: string) =>
    apiFetch<OrchestrationStatus>(`/projects/${projectId}/orchestration/status`, {}, true),
  runOrchestration: (
    projectId: string,
    body?: { through?: string; forceTts?: boolean; regenerate?: boolean },
  ) =>
    apiFetch<OrchestrationRunResult>(`/projects/${projectId}/orchestration/run`, {
      method: "POST",
      body: JSON.stringify(body ?? { through: "quality-control" }),
    }, true),
  pauseOrchestration: (projectId: string) =>
    apiFetch<{ status: string }>(`/projects/${projectId}/orchestration/pause`, {
      method: "POST",
      body: JSON.stringify({}),
    }, true),
  resumeOrchestration: (projectId: string) =>
    apiFetch<OrchestrationRunResult>(`/projects/${projectId}/orchestration/resume`, {
      method: "POST",
      body: JSON.stringify({}),
    }, true),
  cancelOrchestration: (projectId: string) =>
    apiFetch<{ status: string }>(`/projects/${projectId}/orchestration/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    }, true),
  getRenderStatus: (projectId: string) =>
    apiFetch<RenderStatusResponse>(`/projects/${projectId}/render/status`, {}, true),
  startRender: (
    projectId: string,
    options?: { includeTitles?: boolean; burnSubtitles?: boolean },
  ) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/render/start`, {
      method: "POST",
      body: JSON.stringify({
        includeTitles: options?.includeTitles ?? true,
        burnSubtitles: options?.burnSubtitles ?? true,
      }),
    }, true),
  getTimeline: (projectId: string) =>
    apiFetch<TimelineResponse>(`/projects/${projectId}/timeline`, {}, true),
  getCosts: (projectId: string) =>
    apiFetch<CostsResponse>(`/projects/${projectId}/costs`, {}, true),
  continueEpisode: (
    projectId: string,
    body?: { additionalSeconds?: number; instruction?: string },
  ) =>
    apiFetch<{ job: GenerationJob }>(`/projects/${projectId}/episodes/continue`, {
      method: "POST",
      body: JSON.stringify({
        additionalSeconds: body?.additionalSeconds ?? 120,
        instruction: body?.instruction,
      }),
    }, true),
  assetUrl: (assetId: string) => `${API_URL}/assets/${assetId}/content`,
};



export type GenerationJob = {
  id: string;
  type: string;
  status: string;
  errorMessage?: string | null;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ScreenplayResponse = {
  structured: Record<string, unknown> | null;
  characters: Array<{ id: string; name: string; description: string | null }>;
  environments: Array<{ id: string; name: string; description: string | null }>;
  episodes: Array<{
    id: string;
    title: string;
    chapters: Array<{
      id: string;
      title: string;
      number: number;
      scenes: Array<{ id: string; title: string; number: number; summary: string | null }>;
    }>;
  }>;
  storySummary: string | null;
};

export type ReferenceImage = {
  id: string;
  assetId: string;
  isPrimary: boolean;
  mimeType: string;
  contentUrl: string;
  expression?: string | null;
};

export type ReferencesResponse = {
  characters: Array<{
    id: string;
    name: string;
    description: string | null;
    physicalAppearance: string | null;
    clothing: string | null;
    personality: string | null;
    references: ReferenceImage[];
  }>;
  environments: Array<{
    id: string;
    name: string;
    description: string | null;
    lighting: string | null;
    colorPalette: string | null;
    references: ReferenceImage[];
  }>;
};

export type StoryboardShot = {
  id: string;
  number: number;
  description: string;
  compactPrompt: string | null;
  cameraAngle: string | null;
  cameraMovement: string | null;
  dialogue: string | null;
  narration: string | null;
  targetDurationSec: number;
  strategy: string;
  status: string;
  continuityNotes: string | null;
  characterNames: Array<string | undefined>;
  chapterNumber: number;
  chapterTitle: string;
  sceneNumber: number;
  sceneTitle: string;
  locationName: string | null;
};

export type StoryboardResponse = {
  plannedSeconds: number;
  shotCount: number;
  shots: StoryboardShot[];
};

export type VideoStatusShot = {
  shotId: string;
  number: number;
  description: string;
  strategy: string;
  status: string;
  targetDurationSec: number;
  previousShotId: string | null;
  segment: {
    id: string;
    status: string;
    assetId: string | null;
    provider: string;
    modelId: string | null;
    durationMs: number | null;
    nativeAudio: boolean;
    errorMessage: string | null;
    interactionId: string | null;
  } | null;
};

export type VideoStatusResponse = {
  total: number;
  succeeded: number;
  failed: number;
  generating: number;
  pending: number;
  generatedSeconds: number;
  shots: VideoStatusShot[];
};

export type AudioStatusShot = {
  shotId: string;
  number: number;
  description: string;
  dialogue: string | null;
  narration: string | null;
  targetDurationSec: number;
  segment: {
    id: string;
    status: string;
    source: string;
    assetId: string | null;
    voiceId: string | null;
    language: string | null;
    text: string | null;
    durationMs: number | null;
    errorMessage: string | null;
  } | null;
};

export type AudioStatusResponse = {
  total: number;
  withAudio: number;
  native: number;
  tts: number;
  failed: number;
  subtitle: {
    id: string;
    language: string;
    format: string;
    assetId: string | null;
  } | null;
  shots: AudioStatusShot[];
};

export type OrchestrationStage = {
  id: string;
  status: string;
  complete: boolean;
  detail?: unknown;
};

export type OrchestrationStatus = {
  projectId: string;
  projectStatus: string;
  progressPercent: number;
  nextStage: string | null;
  stages: OrchestrationStage[];
  activeJobs: GenerationJob[];
};

export type OrchestrationRunResult = {
  done?: boolean;
  nextStage?: string | null;
  enqueued?: unknown;
  status?: string;
};

export type RenderStatusResponse = {
  latest: {
    id: string;
    status: string;
    resolution: string;
    outputAssetId: string | null;
    errorMessage: string | null;
    sizeBytes: number | null;
    mimeType: string | null;
  } | null;
  renders: Array<{
    id: string;
    status: string;
    outputAssetId: string | null;
    resolution: string;
    errorMessage: string | null;
    createdAt: string;
  }>;
};

export type TimelineItem = {
  shotId: string;
  episodeNumber: number;
  episodeTitle: string;
  chapterNumber: number;
  sceneNumber: number;
  sceneTitle: string;
  shotNumber: number;
  description: string;
  strategy: string;
  status: string;
  startSeconds: number;
  endSeconds: number;
  durationSec: number;
  dialogue: string | null;
  narration: string | null;
  markers: {
    hasVideo: boolean;
    hasAudio: boolean;
    hasDialogue: boolean;
    hasNarration: boolean;
  };
  video: {
    assetId: string | null;
    status: string;
    nativeAudio: boolean;
  } | null;
  audio: {
    assetId: string | null;
    status: string;
    source: string;
  } | null;
};

export type TimelineResponse = {
  totalShots: number;
  totalSeconds: number;
  succeeded: number;
  failed: number;
  pending: number;
  generating: number;
  episodes: Array<{
    id: string;
    number: number;
    title: string;
    summary: string | null;
  }>;
  items: TimelineItem[];
};

export type CostsResponse = {
  project: {
    id: string;
    estimatedCostUsd: number;
    actualCostUsd: number;
    budgetLimitUsd: number | null;
    targetDurationSeconds: number;
    resolution: string;
  };
  budget?: {
    remainingUsd: number | null;
    pendingVideoSeconds: number;
    pendingVideoEstimateUsd: number;
    projectedUsd: number;
    overBudget: boolean;
  };
  totals: {
    estimatedUsd: number;
    actualUsd: number;
    usageEstimatedUsd: number;
    usageActualUsd: number;
    inputTokens: number;
    outputTokens: number;
    videoSeconds: number;
    imageCount: number;
    audioChars: number;
    recordCount: number;
  };
  byProvider: Array<{
    provider: string;
    estimatedUsd: number;
    actualUsd: number;
    inputTokens: number;
    outputTokens: number;
    videoSeconds: number;
    imageCount: number;
    audioChars: number;
    operations: number;
  }>;
  byOperation: Array<{
    operation: string;
    provider: string;
    estimatedUsd: number;
    actualUsd: number;
    count: number;
    videoSeconds: number;
    imageCount: number;
    audioChars: number;
  }>;
  recent: Array<{
    id: string;
    provider: string;
    model: string;
    operation: string;
    estimatedUsd: number;
    actualUsd: number;
    createdAt: string;
  }>;
};

export type ProjectSummary = {
  id: string;
  title: string;
  mode: string;
  status: string;
  targetDurationSeconds: number;
  storyLanguage: string;
  visualStyle: string;
  resolution: string;
  progressPercent: number;
  estimatedCostUsd: string | number | null;
  actualCostUsd: string | number;
  budgetLimitUsd: string | number | null;
  createdAt: string;
  updatedAt: string;
  topic?: string | null;
  dialogueLanguage?: string;
  narrationLanguage?: string;
  voiceLanguage?: string;
  subtitleLanguage?: string;
  videoProvider?: string;
  customStyleNotes?: string | null;
  aspectRatio?: string;
};

export type ProjectDetail = ProjectSummary & {
  episodes: unknown[];
  characters: unknown[];
  environments: unknown[];
  scripts: unknown[];
  generationJobs: unknown[];
  costRecords: unknown[];
};

export type CreateProjectBody = {
  title: string;
  mode: string;
  topic?: string;
  targetDurationSeconds: number;
  storyLanguage: string;
  dialogueLanguage: string;
  narrationLanguage: string;
  voiceLanguage: string;
  subtitleLanguage: string;
  visualStyle: string;
  customStyleNotes?: string;
  resolution: string;
  aspectRatio: string;
  videoProvider: string;
  budgetLimitUsd?: number;
};

export type HealthResponse = {
  ok: boolean;
  service: string;
  phase: number;
  videoGenerationEnabled: boolean;
  audioGenerationEnabled?: boolean;
  checks: Record<string, { ok: boolean; message: string }>;
};
