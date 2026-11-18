FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/workers ./apps/workers
RUN pnpm install --filter @studio/workers...

FROM deps AS build
RUN pnpm --filter @studio/shared build \
 && pnpm --filter @studio/db generate \
 && pnpm --filter @studio/db build \
 && pnpm --filter @studio/providers build \
 && pnpm --filter @studio/workers build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/workers
CMD ["node", "dist/index.js"]
