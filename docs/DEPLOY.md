# Deploy guide

## Architecture

- `apps/web` — Next.js UI
- `apps/api` — Express REST + SSE
- `apps/workers` — BullMQ consumers (story → render + continue)
- PostgreSQL, Redis, object storage (MinIO locally / S3 in production)

## Local (mock providers)

No Google keys required. Keep providers on mock:

```env
LLM_PROVIDER=mock
IMAGE_PROVIDER=mock
VIDEO_PROVIDER=mock
AUDIO_PROVIDER=mock
GEMINI_API_KEY=
```

```bash
pnpm install
cp .env.example .env
pnpm db:embedded   # or docker compose up -d postgres redis minio minio-init
pnpm db:generate && pnpm db:push && pnpm db:seed
pnpm --filter @studio/shared build
pnpm --filter @studio/providers build
pnpm --filter @studio/pipeline build
pnpm --filter @studio/db build
pnpm dev:api
pnpm dev:workers
pnpm dev:web
pnpm validate:phase10
```

## Live Google providers

1. Create a Gemini API key.
2. Optional Cloud TTS: GCP project + service-account JSON with Text-to-Speech access.
3. Update `.env`:

```env
GEMINI_API_KEY=your_key
LLM_PROVIDER=auto
IMAGE_PROVIDER=auto
VIDEO_PROVIDER=auto
AUDIO_PROVIDER=auto
GOOGLE_CLOUD_PROJECT=your-gcp-project
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/sa.json
```

`auto` selects live providers when credentials exist, otherwise mock.

## Docker Compose

```bash
cp .env.example .env
# set JWT secrets, GEMINI_API_KEY, and storage as needed
docker compose up --build
```

Compose wires:

- Postgres `studio/studio`
- Redis
- MinIO + bucket init
- api / workers / web

For production Compose or Kubernetes, override:

- `DATABASE_URL`, `REDIS_URL`
- `S3_ENDPOINT` / `S3_BUCKET` / credentials (or AWS IAM)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (must not contain `change-me`)
- `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`
- concurrency: `VIDEO_CONCURRENCY`, `AUDIO_CONCURRENCY`, `QC_CONCURRENCY`, `RENDER_CONCURRENCY`

## Production checklist

- [ ] Strong JWT secrets
- [ ] `NODE_ENV=production`
- [ ] Managed Postgres + Redis with backups
- [ ] S3 (or compatible) bucket with private ACL; serve assets through API auth
- [ ] Set project `budgetLimitUsd` for spend control (enforced on create, video, continue)
- [ ] Keep `VIDEO_CONCURRENCY=1` until quota headroom is proven
- [ ] Prefer Omni native audio; enable Cloud TTS only when needed
- [ ] Run `pnpm validate:phase10` against a staging API before cutover

## Acceptance coverage (`validate:phase10`)

- Auth + project create
- Reject create when estimate exceeds budget
- Topic → storyboard → video → audio → render asset download
- Timeline + cost breakdown + budget projection
- Continue episode without wiping prior episodes
- Reject video start when pending clip cost would exceed budget
