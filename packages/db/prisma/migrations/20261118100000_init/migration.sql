-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GenerationMode" AS ENUM ('TOPIC_TO_VIDEO', 'SCRIPT_TO_VIDEO', 'VIDEO_REFERENCE');

-- CreateEnum
CREATE TYPE "VisualStyle" AS ENUM ('CINEMATIC', 'ANIMATION_2D', 'ANIMATION_3D', 'REALISTIC', 'DOCUMENTARY', 'EDUCATIONAL', 'CARTOON', 'ANIME', 'EXPLAINER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Resolution" AS ENUM ('P720', 'P1080', 'P4K');

-- CreateEnum
CREATE TYPE "AspectRatio" AS ENUM ('LANDSCAPE_16_9', 'PORTRAIT_9_16');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PLANNING', 'GENERATING', 'PAUSED', 'RENDERING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SegmentStatus" AS ENUM ('PENDING', 'QUEUED', 'GENERATING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('STORY_GENERATION', 'SCRIPT_ANALYSIS', 'CHARACTER_GENERATION', 'ENVIRONMENT_GENERATION', 'STORYBOARD_GENERATION', 'VIDEO_GENERATION', 'VIDEO_EXTENSION', 'AUDIO_GENERATION', 'QUALITY_CONTROL', 'VIDEO_RENDERING');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'SUBTITLE', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "VideoStrategy" AS ENUM ('TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'REFERENCE_TO_VIDEO', 'FIRST_LAST_FRAME', 'EXTEND', 'REUSE', 'IMAGE_ANIMATION');

-- CreateEnum
CREATE TYPE "AudioSource" AS ENUM ('NATIVE_VIDEO', 'CLOUD_TTS', 'GEMINI_TTS', 'UPLOADED', 'NONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "GenerationMode" NOT NULL,
    "topic" TEXT,
    "targetDurationSeconds" INTEGER NOT NULL,
    "storyLanguage" TEXT NOT NULL DEFAULT 'en',
    "dialogueLanguage" TEXT NOT NULL DEFAULT 'en',
    "narrationLanguage" TEXT NOT NULL DEFAULT 'en',
    "voiceLanguage" TEXT NOT NULL DEFAULT 'en',
    "subtitleLanguage" TEXT NOT NULL DEFAULT 'en',
    "visualStyle" "VisualStyle" NOT NULL DEFAULT 'CINEMATIC',
    "customStyleNotes" TEXT,
    "resolution" "Resolution" NOT NULL DEFAULT 'P720',
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'LANDSCAPE_16_9',
    "videoProvider" TEXT NOT NULL DEFAULT 'google-omni',
    "budgetLimitUsd" DECIMAL(12,4),
    "estimatedCostUsd" DECIMAL(12,4),
    "actualCostUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "storySummary" TEXT,
    "artDirection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "targetDurationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "structured" JSONB,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "targetDurationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "locationName" TEXT,
    "environmentId" TEXT,
    "targetDurationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shot" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "compactPrompt" TEXT,
    "cameraAngle" TEXT,
    "cameraMovement" TEXT,
    "dialogue" TEXT,
    "narration" TEXT,
    "targetDurationSec" INTEGER NOT NULL,
    "strategy" "VideoStrategy" NOT NULL DEFAULT 'TEXT_TO_VIDEO',
    "status" "SegmentStatus" NOT NULL DEFAULT 'PENDING',
    "characterIds" TEXT[],
    "previousShotId" TEXT,
    "continuityNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "physicalAppearance" TEXT,
    "clothing" TEXT,
    "colors" TEXT,
    "personality" TEXT,
    "voiceProfile" JSONB,
    "relationships" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterReference" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "expression" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lighting" TEXT,
    "colorPalette" TEXT,
    "artDirection" TEXT,
    "cameraNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentReference" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvironmentReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "jobKey" TEXT NOT NULL,
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "bullJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "AssetType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSegment" (
    "id" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "assetId" TEXT,
    "status" "SegmentStatus" NOT NULL DEFAULT 'PENDING',
    "strategy" "VideoStrategy" NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT,
    "promptVersion" TEXT,
    "durationMs" INTEGER,
    "nativeAudio" BOOLEAN NOT NULL DEFAULT true,
    "providerJobId" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioSegment" (
    "id" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "assetId" TEXT,
    "status" "SegmentStatus" NOT NULL DEFAULT 'PENDING',
    "source" "AudioSource" NOT NULL DEFAULT 'NATIVE_VIDEO',
    "voiceId" TEXT,
    "language" TEXT,
    "text" TEXT,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtitle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'srt',
    "assetId" TEXT,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subtitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "outputAssetId" TEXT,
    "resolution" "Resolution" NOT NULL,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "videoSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "audioChars" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "usageRecordId" TEXT,
    "pricingVersion" TEXT NOT NULL,
    "estimatedUsd" DECIMAL(12,6) NOT NULL,
    "actualUsd" DECIMAL(12,6),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingCatalog" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "catalog" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_projectId_number_key" ON "Episode"("projectId", "number");

-- CreateIndex
CREATE INDEX "Script_projectId_idx" ON "Script"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_episodeId_number_key" ON "Chapter"("episodeId", "number");

-- CreateIndex
CREATE INDEX "Scene_environmentId_idx" ON "Scene"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_chapterId_number_key" ON "Scene"("chapterId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Shot_sceneId_number_key" ON "Shot"("sceneId", "number");

-- CreateIndex
CREATE INDEX "Character_projectId_idx" ON "Character"("projectId");

-- CreateIndex
CREATE INDEX "CharacterReference_characterId_idx" ON "CharacterReference"("characterId");

-- CreateIndex
CREATE INDEX "Environment_projectId_idx" ON "Environment"("projectId");

-- CreateIndex
CREATE INDEX "EnvironmentReference_environmentId_idx" ON "EnvironmentReference"("environmentId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_jobKey_key" ON "GenerationJob"("jobKey");

-- CreateIndex
CREATE INDEX "GenerationJob_projectId_status_idx" ON "GenerationJob"("projectId", "status");

-- CreateIndex
CREATE INDEX "GenerationJob_type_status_idx" ON "GenerationJob"("type", "status");

-- CreateIndex
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

-- CreateIndex
CREATE INDEX "Asset_storageKey_idx" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "VideoSegment_shotId_status_idx" ON "VideoSegment"("shotId", "status");

-- CreateIndex
CREATE INDEX "AudioSegment_shotId_status_idx" ON "AudioSegment"("shotId", "status");

-- CreateIndex
CREATE INDEX "Subtitle_projectId_idx" ON "Subtitle"("projectId");

-- CreateIndex
CREATE INDEX "RenderJob_projectId_status_idx" ON "RenderJob"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_name_key" ON "ProviderConfig"("name");

-- CreateIndex
CREATE INDEX "UsageRecord_projectId_createdAt_idx" ON "UsageRecord"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CostRecord_projectId_createdAt_idx" ON "CostRecord"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PricingCatalog_version_key" ON "PricingCatalog"("version");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shot" ADD CONSTRAINT "Shot_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterReference" ADD CONSTRAINT "CharacterReference_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterReference" ADD CONSTRAINT "CharacterReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentReference" ADD CONSTRAINT "EnvironmentReference_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentReference" ADD CONSTRAINT "EnvironmentReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSegment" ADD CONSTRAINT "VideoSegment_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSegment" ADD CONSTRAINT "VideoSegment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioSegment" ADD CONSTRAINT "AudioSegment_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "Shot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioSegment" ADD CONSTRAINT "AudioSegment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtitle" ADD CONSTRAINT "Subtitle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtitle" ADD CONSTRAINT "Subtitle_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostRecord" ADD CONSTRAINT "CostRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

