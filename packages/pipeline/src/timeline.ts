import { prisma } from "@studio/db";

export async function getProjectTimeline(projectId: string) {
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
                  videoSegments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                  audioSegments: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const characters = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const characterNameById = new Map(characters.map((item) => [item.id, item.name]));

  let cursorSeconds = 0;
  const items = [];

  for (const episode of episodes) {
    for (const chapter of episode.chapters) {
      for (const scene of chapter.scenes) {
        for (const shot of scene.shots) {
          const video = shot.videoSegments[0] ?? null;
          const audio = shot.audioSegments[0] ?? null;
          const durationSec =
            video?.durationMs != null
              ? Math.max(1, Math.round(video.durationMs / 1000))
              : shot.targetDurationSec;
          const startSeconds = cursorSeconds;
          const endSeconds = startSeconds + durationSec;
          cursorSeconds = endSeconds;

          items.push({
            shotId: shot.id,
            episodeId: episode.id,
            episodeNumber: episode.number,
            episodeTitle: episode.title,
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            sceneNumber: scene.number,
            sceneTitle: scene.title,
            locationName: scene.locationName,
            shotNumber: shot.number,
            description: shot.description,
            strategy: shot.strategy,
            status: shot.status,
            dialogue: shot.dialogue,
            narration: shot.narration,
            targetDurationSec: shot.targetDurationSec,
            startSeconds,
            endSeconds,
            durationSec,
            characterNames: shot.characterIds
              .map((id) => characterNameById.get(id))
              .filter(Boolean),
            video: video
              ? {
                  segmentId: video.id,
                  status: video.status,
                  assetId: video.assetId,
                  provider: video.provider,
                  nativeAudio: video.nativeAudio,
                  durationMs: video.durationMs,
                  errorMessage: video.errorMessage,
                }
              : null,
            audio: audio
              ? {
                  segmentId: audio.id,
                  status: audio.status,
                  source: audio.source,
                  assetId: audio.assetId,
                  voiceId: audio.voiceId,
                  language: audio.language,
                  durationMs: audio.durationMs,
                  errorMessage: audio.errorMessage,
                }
              : null,
            markers: {
              hasVideo: Boolean(video?.assetId),
              hasAudio: Boolean(audio?.assetId) || Boolean(video?.nativeAudio && video?.assetId),
              hasDialogue: Boolean(shot.dialogue),
              hasNarration: Boolean(shot.narration),
            },
          });
        }
      }
    }
  }

  const succeeded = items.filter((item) => item.status === "SUCCEEDED").length;
  const failed = items.filter((item) => item.status === "FAILED").length;
  const pending = items.filter(
    (item) => item.status === "PENDING" || item.status === "QUEUED",
  ).length;
  const generating = items.filter((item) => item.status === "GENERATING").length;

  return {
    totalShots: items.length,
    totalSeconds: cursorSeconds,
    succeeded,
    failed,
    pending,
    generating,
    episodes: episodes.map((episode) => ({
      id: episode.id,
      number: episode.number,
      title: episode.title,
      summary: episode.summary,
      targetDurationSeconds: episode.targetDurationSeconds,
    })),
    items,
  };
}
