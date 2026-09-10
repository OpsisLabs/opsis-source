FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/shared packages/shared
ARG VITE_API_BASE_URL=
ARG VITE_CLOUD_WORKSPACE_ENABLED=false
ARG VITE_COLLECTIBLE_CATALOG_ENABLED=false
ARG VITE_MARKET_INVENTORY_ENABLED=false
ARG VITE_REPLAY_ACTIONS_ENABLED=false
ARG VITE_OPEN_DATA_API_ENABLED=false
ARG VITE_APPROVAL_MANAGER_ENABLED=false
ARG VITE_BUILD_SHA
ARG VITE_PUBLIC_SITE_URL
ARG RAILWAY_GIT_COMMIT_SHA
ARG RAILWAY_PUBLIC_DOMAIN
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_CLOUD_WORKSPACE_ENABLED=$VITE_CLOUD_WORKSPACE_ENABLED
ENV VITE_COLLECTIBLE_CATALOG_ENABLED=$VITE_COLLECTIBLE_CATALOG_ENABLED
ENV VITE_MARKET_INVENTORY_ENABLED=$VITE_MARKET_INVENTORY_ENABLED
ENV VITE_REPLAY_ACTIONS_ENABLED=$VITE_REPLAY_ACTIONS_ENABLED
ENV VITE_OPEN_DATA_API_ENABLED=$VITE_OPEN_DATA_API_ENABLED
ENV VITE_APPROVAL_MANAGER_ENABLED=$VITE_APPROVAL_MANAGER_ENABLED
ENV VITE_BUILD_SHA=$VITE_BUILD_SHA
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
ENV RAILWAY_PUBLIC_DOMAIN=$RAILWAY_PUBLIC_DOMAIN
RUN pnpm --filter @rh-chain/shared build && pnpm --filter @rh-chain/web build

FROM nginx:1.30.4-alpine3.24@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46
# The base digest is intentionally pinned for reproducibility, then upgraded
# inside the same Alpine release so newly published security fixes are not
# deferred until the next upstream image digest refresh.
RUN apk upgrade --no-cache \
  && apk add --no-cache ca-certificates
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
ENV API_UPSTREAM_SCHEME=http
ENV API_UPSTREAM_HOST=api.railway.internal
ENV API_UPSTREAM_PORT=4000
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM_SCHEME|API_UPSTREAM_HOST|API_UPSTREAM_PORT
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
