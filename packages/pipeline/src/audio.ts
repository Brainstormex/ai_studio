import { prisma } from "@studio/db";
import {
  createAudioProviderFromEnv,
  createStorageFromEnv,
} from "@studio/providers";
import { chirp3VoiceName, toBcp47 } from "@studio/shared";
import { assertProjectRunnable, patchProjectIfActive } from "./orchestration.js";
import { recordTtsUsage } from "./usage.js";

type VoiceProfile = {
  voiceName?: string;
  languageCode?: string;
};

function spokenText(shot: { dialogue: string | null; narration: string | null }): string | null {
  const text = (shot.dialogue || shot.narration || "").trim();
  return text.length ? text : null;
}

function formatSrtTime(totalMs: number): string {
  const clamped = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const ms = clamped % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

async function orderedShots(projectId: string) {
  const episodes = await prisma.episode.findMany({
    where: { projectId },
    orderBy: { number: "asc" },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: {
          scenes: {
            orderBy: { number: "asc" },
            include: {
              shots: {
                orderBy: { number: "asc" },
                include: {
                  audioSegments: { orderBy: { createdAt: "desc" }, take: 1 },
                  videoSegments: { orderBy: { createdAt: "desc" }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  return episodes.flatMap((episode) =>
    episode.chapters.flatMap((chapter) =>
      chapter.scenes.flatMap((scene) => scene.shots),
    ),
  );
}

async function resolveVoice(params: {
  projectVoiceLanguage: string;
  shotCharacterIds: string[];
  kind: "dialogue" | "narration";
  projectNarrationLanguage: string;
  projectDialogueLanguage: string;
}) {
  const language =
    params.kind === "narration"
      ? params.projectNarrationLanguage
      : params.projectDialogueLanguage || params.projectVoiceLanguage;

  let voiceName: string | undefined;
  if (params.shotCharacterIds[0]) {
    const character = await prisma.character.findUnique({
      where: { id: params.shotCharacterIds[0] },
    });
    const profile = (character?.voiceProfile ?? null) as VoiceProfile | null;
    if (profile?.voiceName) voiceName = profile.voiceName;
    if (profile?.languageCode) {
      return {
        languageCode: toBcp47(profile.languageCode),
        voiceName: voiceName || chirp3VoiceName(profile.languageCode),
      };
    }
  }

  const languageCode = toBcp47(language);
  return {
    languageCode,
    voiceName: voiceName || chirp3VoiceName(languageCode),
  };
}

async function storeAudioAsset(params: {
  projectId: string;
  shotId: string;
  audioBytes: Buffer;
  mimeType: string;
  provider: string;
  voiceId?: string;
}) {
  const storage = createStorageFromEnv();
  const extension = params.mimeType.includes("wav")
    ? "wav"
    : params.mimeType.includes("ogg")
      ? "ogg"
      : "mp3";
  const key = `projects/${params.projectId}/audio/${params.shotId}/${Date.now()}.${extension}`;
  const stored = await storage.putObject({
    key,
    body: params.audioBytes,
    contentType: params.mimeType,
  });

  return prisma.asset.create({
    data: {
      projectId: params.projectId,
      type: "AUDIO",
      storageKey: stored.key,
      bucket: stored.bucket,
      mimeType: params.mimeType,
      sizeBytes: params.audioBytes.length,
      metadata: {
        provider: params.provider,
        shotId: params.shotId,
        voiceId: params.voiceId,
        url: stored.url,
      },
    },
  });
}

export async function generateShotAudio(params: {
  projectId: string;
  shotId: string;
  forceTts?: boolean;
  regenerate?: boolean;
}) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: params.projectId },
  });
  const shot = await prisma.shot.findUniqueOrThrow({
    where: { id: params.shotId },
    include: {
      audioSegments: { orderBy: { createdAt: "desc" }, take: 1 },
      videoSegments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const existing = shot.audioSegments[0];
  const text = spokenText(shot);
  const videoSucceeded = shot.videoSegments[0]?.status === "SUCCEEDED";
  const nativeOk =
    existing?.status === "SUCCEEDED" &&
    existing.source === "NATIVE_VIDEO" &&
    !params.forceTts;

  if (!params.regenerate && !params.forceTts && nativeOk) {
    return {
      skipped: true,
      shotId: shot.id,
      segmentId: existing.id,
      source: existing.source,
    };
  }

  if (!params.forceTts && !text) {
    const segment = await prisma.audioSegment.create({
      data: {
        shotId: shot.id,
        status: "SUCCEEDED",
        source: videoSucceeded ? "NATIVE_VIDEO" : "NONE",
        durationMs: shot.targetDurationSec * 1000,
        language: project.voiceLanguage,
        text: null,
        metadata: { reason: "no-spoken-text" },
      },
    });
    return {
      skipped: false,
      shotId: shot.id,
      segmentId: segment.id,
      source: segment.source,
    };
  }

  if (!params.forceTts && text && videoSucceeded && existing?.source === "NATIVE_VIDEO") {
    if (!params.regenerate) {
      return {
        skipped: true,
        shotId: shot.id,
        segmentId: existing.id,
        source: "NATIVE_VIDEO",
      };
    }
  }

  if (!params.forceTts && text && videoSucceeded && (!existing || existing.status !== "SUCCEEDED")) {
    const segment = await prisma.audioSegment.create({
      data: {
        shotId: shot.id,
        status: "SUCCEEDED",
        source: "NATIVE_VIDEO",
        durationMs: (shot.videoSegments[0]?.durationMs ?? shot.targetDurationSec * 1000),
        language: project.dialogueLanguage || project.voiceLanguage,
        text,
        metadata: { preferred: "native-omni" },
      },
    });
    return {
      skipped: false,
      shotId: shot.id,
      segmentId: segment.id,
      source: "NATIVE_VIDEO",
    };
  }

  if (!text) {
    const segment = await prisma.audioSegment.create({
      data: {
        shotId: shot.id,
        status: "SUCCEEDED",
        source: "NONE",
        durationMs: shot.targetDurationSec * 1000,
        language: project.voiceLanguage,
      },
    });
    return {
      skipped: false,
      shotId: shot.id,
      segmentId: segment.id,
      source: "NONE",
    };
  }

  const kind = shot.narration && !shot.dialogue ? "narration" : "dialogue";
  const voice = await resolveVoice({
    projectVoiceLanguage: project.voiceLanguage,
    shotCharacterIds: shot.characterIds,
    kind,
    projectNarrationLanguage: project.narrationLanguage,
    projectDialogueLanguage: project.dialogueLanguage,
  });

  const pending = await prisma.audioSegment.create({
    data: {
      shotId: shot.id,
      status: "GENERATING",
      source: "CLOUD_TTS",
      voiceId: voice.voiceName,
      language: voice.languageCode,
      text,
    },
  });

  try {
    const audio = createAudioProviderFromEnv();
    const synthesized = await audio.synthesize({
      text,
      languageCode: voice.languageCode,
      voiceName: voice.voiceName,
    });

    const asset = await storeAudioAsset({
      projectId: params.projectId,
      shotId: shot.id,
      audioBytes: synthesized.audioBytes,
      mimeType: synthesized.mimeType,
      provider: synthesized.provider,
      voiceId: voice.voiceName,
    });

    const durationMs = Math.min(15000, Math.max(800, text.length * 45));
    await prisma.audioSegment.update({
      where: { id: pending.id },
      data: {
        status: "SUCCEEDED",
        assetId: asset.id,
        durationMs,
        metadata: {
          provider: synthesized.provider,
          mimeType: synthesized.mimeType,
          voiceName: voice.voiceName,
        },
      },
    });

    await recordTtsUsage({
      projectId: params.projectId,
      provider: synthesized.provider,
      model: voice.voiceName,
      operation: `shot-tts:${kind}`,
      audioChars: text.length,
    });

    return {
      skipped: false,
      shotId: shot.id,
      segmentId: pending.id,
      assetId: asset.id,
      source: "CLOUD_TTS" as const,
      provider: synthesized.provider,
      chars: text.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS failed";
    await prisma.audioSegment.update({
      where: { id: pending.id },
      data: { status: "FAILED", errorMessage: message },
    });
    throw error;
  }
}

export async function buildProjectSubtitles(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const shots = await orderedShots(projectId);
  const lines: string[] = [];
  let cursorMs = 0;
  let index = 1;

  for (const shot of shots) {
    const text = spokenText(shot);
    const durationMs = shot.targetDurationSec * 1000;
    if (text) {
      const start = cursorMs;
      const end = cursorMs + durationMs;
      lines.push(String(index));
      lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
      lines.push(text);
      lines.push("");
      index += 1;
    }
    cursorMs += durationMs;
  }

  const content = lines.join("\n").trim();
  if (!content) {
    return { skipped: true, subtitleId: null as string | null };
  }

  const storage = createStorageFromEnv();
  const key = `projects/${projectId}/subtitles/${project.subtitleLanguage}-${Date.now()}.srt`;
  const body = Buffer.from(content, "utf8");
  const stored = await storage.putObject({
    key,
    body,
    contentType: "application/x-subrip",
  });

  const asset = await prisma.asset.create({
    data: {
      projectId,
      type: "SUBTITLE",
      storageKey: stored.key,
      bucket: stored.bucket,
      mimeType: "application/x-subrip",
      sizeBytes: body.length,
      metadata: { language: project.subtitleLanguage, url: stored.url },
    },
  });

  const subtitle = await prisma.subtitle.create({
    data: {
      projectId,
      language: project.subtitleLanguage,
      format: "srt",
      assetId: asset.id,
      content,
    },
  });

  return { skipped: false, subtitleId: subtitle.id, assetId: asset.id, cueCount: index - 1 };
}

export async function generateProjectAudio(params: {
  projectId: string;
  regenerate?: boolean;
  forceTts?: boolean;
  shotIds?: string[];
}) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: params.projectId },
  });

  const shots = await orderedShots(params.projectId);
  const selected = params.shotIds?.length
    ? shots.filter((shot) => params.shotIds!.includes(shot.id))
    : shots;

  if (!selected.length) {
    throw new Error("No shots available for audio generation");
  }

  await patchProjectIfActive(params.projectId, {
    status: "GENERATING",
    progressPercent: Math.max(project.progressPercent, 86),
  });

  const results = [];
  let completed = 0;
  for (const shot of selected) {
    await assertProjectRunnable(params.projectId);
    const result = await generateShotAudio({
      projectId: params.projectId,
      shotId: shot.id,
      forceTts: params.forceTts,
      regenerate: params.regenerate,
    });
    results.push(result);
    completed += 1;
    const progress = 86 + Math.round((completed / selected.length) * 6);
    await patchProjectIfActive(params.projectId, {
      progressPercent: Math.min(progress, 92),
    });
  }

  const subtitles = await buildProjectSubtitles(params.projectId);

  await patchProjectIfActive(params.projectId, { progressPercent: 92 });

  return {
    projectId: params.projectId,
    processed: results.length,
    ttsCount: results.filter((item) => item.source === "CLOUD_TTS").length,
    nativeCount: results.filter((item) => item.source === "NATIVE_VIDEO").length,
    results,
    subtitles,
  };
}

export async function getProjectAudioStatus(projectId: string) {
  const shots = await orderedShots(projectId);
  const items = shots.map((shot) => {
    const segment = shot.audioSegments[0] ?? null;
    return {
      shotId: shot.id,
      number: shot.number,
      description: shot.description,
      dialogue: shot.dialogue,
      narration: shot.narration,
      targetDurationSec: shot.targetDurationSec,
      segment: segment
        ? {
            id: segment.id,
            status: segment.status,
            source: segment.source,
            assetId: segment.assetId,
            voiceId: segment.voiceId,
            language: segment.language,
            text: segment.text,
            durationMs: segment.durationMs,
            errorMessage: segment.errorMessage,
          }
        : null,
    };
  });

  const subtitle = await prisma.subtitle.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return {
    total: items.length,
    withAudio: items.filter((item) => item.segment?.status === "SUCCEEDED").length,
    native: items.filter((item) => item.segment?.source === "NATIVE_VIDEO").length,
    tts: items.filter((item) => item.segment?.source === "CLOUD_TTS").length,
    failed: items.filter((item) => item.segment?.status === "FAILED").length,
    subtitle: subtitle
      ? {
          id: subtitle.id,
          language: subtitle.language,
          format: subtitle.format,
          assetId: subtitle.assetId,
        }
      : null,
    shots: items,
  };
}
