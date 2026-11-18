# Lumen Stage — Autonomous AI Long-Form Video Studio

Production-oriented monorepo for autonomous long-form AI video generation.

Primary video model: `gemini-omni-1.2-flash` (Gemini Interactions API). Veo 3.1 Preview is shut down in the Gemini API.

**Phases 1–10 complete.** Without API keys the stack runs on mock providers end-to-end.

## Stack

| Layer | Tech |
|---|---|
| Web | Next.js, React, TypeScript, Tailwind |
| API | Node.js, Express, TypeScript |
| DB | PostgreSQL + Prisma |
| Jobs | Redis + BullMQ |
| Storage | MinIO (S3-compatible) locally → AWS S3 |
| AI | Gemini LLM/images, Omni Flash video, optional Cloud TTS |
| Render | FFmpeg (ffmpeg-static / ffprobe-static) |

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop **or** local Redis + embedded Postgres

### 1. Install

```bash
pnpm install
cp .env.example .env
```

### 2. Infrastructure

**Docker:**

```bash
docker compose up -d postgres redis minio minio-init
```

**Local / embedded Postgres:**

```bash
pnpm db:embedded
```

Set `DATABASE_URL` to port `5433` and `STORAGE_DRIVER=fs` when using embedded Postgres + filesystem storage.

### 3. Migrate and seed

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

Default admin: `admin@studio.local` / `Admin123!`

### 4. Run apps

```bash
pnpm --filter @studio/shared build
pnpm --filter @studio/providers build
pnpm --filter @studio/pipeline build
pnpm --filter @studio/db build
pnpm dev:api
pnpm dev:workers
pnpm dev:web
```

- Web: http://localhost:3000
- API: http://localhost:4000/health
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

### 5. Validate

```bash
pnpm validate:phase10
```

Runs the full acceptance path (budget guards, pipeline, render, timeline/costs, continue episode).

## Providers / API keys

| Mode | Config |
|---|---|
| Offline mock (default for local) | `LLM_PROVIDER=mock` (and image/video/audio mock) |
| Live Gemini / Omni | Set `GEMINI_API_KEY`, providers `auto` |
| Cloud TTS fallback | `GOOGLE_CLOUD_PROJECT` + `GOOGLE_APPLICATION_CREDENTIALS` |

With empty `GEMINI_API_KEY` and `auto`, factories fall back to mock automatically.

## Features

- Topic → structured screenplay; script upload (TXT/PDF/DOCX/SRT)
- Character / environment reference library
- AI Director storyboard (3–15s shots, EXTEND continuity)
- Explicit Omni video start (cost-aware)
- Native audio preferred; optional Cloud TTS
- Orchestration pause / resume / cancel + QC
- FFmpeg master render with titles/subtitles
- Shot timeline + cost dashboard
- Continue-story / next episode (appends, does not wipe)
- Budget enforcement on create, video, and continue

## Environment

See `.env.example` and [docs/DEPLOY.md](docs/DEPLOY.md).

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini LLM, images, Omni video |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional Cloud TTS |
| `DATABASE_URL` / `REDIS_URL` | Data + queues |
| `S3_*` / `STORAGE_DRIVER` | Object storage |
| `JWT_*` | Auth (rotate for production) |
| `*_CONCURRENCY` | Worker parallelism |

## Phase status

1. Foundation — done  
2. Scripts / LLM — done  
3. References — done  
4. Storyboard — done  
5. Video — done  
6. Audio — done  
7. Orchestration — done  
8. FFmpeg render — done  
9. Timeline / costs / continue — done  
10. E2E, hardening, deploy docs — done  

## Acceptance (Phase 10)

- [x] Register / login / project CRUD
- [x] Reject create when estimate exceeds budget
- [x] Topic → storyboard → video → audio → render download
- [x] Timeline + cost breakdown + budget projection
- [x] Continue episode without wiping prior work
- [x] Reject video when pending cost would exceed budget
- [x] Health reports provider modes + Phase 10 flags
