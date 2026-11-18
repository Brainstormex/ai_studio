FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --filter @studio/api...

FROM deps AS build
RUN pnpm --filter @studio/shared build \
 && pnpm --filter @studio/db generate \
 && pnpm --filter @studio/db build \
 && pnpm --filter @studio/providers build \
 && pnpm --filter @studio/api build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
