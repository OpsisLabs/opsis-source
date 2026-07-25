FROM node:22-alpine AS deps
WORKDIR /app
# Prisma probes libssl to choose a query engine; without the openssl package it
# silently assumes OpenSSL 1.1 and generates an engine this image cannot load.
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@8.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @rh-chain/shared build && pnpm --filter @rh-chain/api db:generate && pnpm --filter @rh-chain/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app && corepack enable && corepack prepare pnpm@8.15.9 --activate
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
# package.json travels with dist so the workspace link still resolves if the
# API ever imports a value from shared (today every import is type-only).
# shared has no dependencies of its own, so it has no node_modules to copy.
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
USER app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
