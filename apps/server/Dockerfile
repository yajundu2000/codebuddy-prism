# ---- build frontend ----
# Build stages run on the BUILD machine's arch (their dist/ output is
# arch-independent JS) — without this, multi-arch CI builds crawl through
# vite/tsc under QEMU emulation for hours. Only the runtime stage is per-arch.
# ARG NODE_IMAGE lets CN builds swap in a registry mirror (deploy.sh does).
ARG NODE_IMAGE=docker.io/library/node:22-alpine
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS webbuild
WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN NPM_CONFIG_REGISTRY=${NPM_REGISTRY} npm ci --workspace apps/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build -w apps/web

# ---- build server (TS -> JS, so the container boots in seconds, not minutes) ----
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS serverbuild
WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN NPM_CONFIG_REGISTRY=${NPM_REGISTRY} npm ci --workspace apps/server --include-workspace-root=false
COPY apps/server apps/server
RUN npm run build -w apps/server

# ---- runtime ----
FROM ${NODE_IMAGE}
RUN apk add --no-cache git
WORKDIR /srv
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN NPM_CONFIG_REGISTRY=${NPM_REGISTRY} npm ci --workspace apps/server --include-workspace-root=false --omit=dev
COPY apps/server apps/server
COPY --from=serverbuild /build/apps/server/dist apps/server/dist
COPY --from=serverbuild /build/apps/server/assets apps/server/assets
COPY plugins plugins
COPY templates templates
COPY --from=webbuild /build/apps/web/dist apps/web/dist

ENV PORT=3000 \
    DATA_DIR=/data \
    META_DIR=/secrets \
    COMPILER_URL=http://compiler:4020 \
    PLUGINS_DIR=/srv/plugins \
    TEMPLATES_DIR=/srv/templates \
    WEB_DIST=/srv/apps/web/dist

EXPOSE 3000

LABEL org.opencontainers.image.source="https://github.com/trahloff/Aldine" \
      org.opencontainers.image.url="https://aldine.dev" \
      org.opencontainers.image.description="Aldine app: self-hosted collaborative LaTeX editor (API, real-time collaboration, web UI)" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
WORKDIR /srv/apps/server
CMD ["node", "dist/index.js"]
