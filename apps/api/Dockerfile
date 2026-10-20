FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS deps
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

FROM build AS production-dependencies
RUN pnpm --filter @rh-chain/api deploy --prod /prod/api \
  && apps/api/node_modules/.bin/prisma generate --schema /prod/api/prisma/schema.prisma \
  && cd /prod/api \
  && node --input-type=module -e 'import { PrismaClient } from "@prisma/client"; const prisma = new PrismaClient(); await prisma.$disconnect()'

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# npm and Corepack are build tools, not API runtime dependencies. Removing
# them from the final layer keeps their archive/config parsers—and their
# unrelated vulnerability surface—out of the deployed service.
RUN apk upgrade --no-cache \
  && apk add --no-cache openssl \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx \
  && addgroup -S app \
  && adduser -S app -G app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=production-dependencies /prod/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
# package.json travels with dist so the workspace link still resolves if the
# API ever imports a value from shared (today every import is type-only).
# shared has no dependencies of its own, so it has no node_modules to copy.
COPY --from=build /app/apps/api/prisma apps/api/prisma
# Fonts for the token card image the Telegram bot sends.
COPY --from=build /app/apps/api/assets apps/api/assets
COPY --from=production-dependencies /prod/api/node_modules apps/api/node_modules
USER app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
