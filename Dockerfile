# Verba backend (apps/backend) for Render / any Docker host. Build from the repo root:
#   docker build -t verba-api .
# The backend depends on the @verba/shared workspace, so the whole monorepo manifest set is needed.

# ── Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first so dependency installs are cached until a package.json or the lockfile changes.
# Every workspace's package.json is copied: npm ci checks them all against the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
RUN npm ci --workspace @verba/backend --include-workspace-root --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm run build -w @verba/backend

# ── Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
# Production dependencies of the backend only (@verba/shared is bundled into dist by tsup).
RUN npm ci --workspace @verba/backend --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/apps/backend/dist apps/backend/dist

# Render sets PORT; the server listens on 0.0.0.0:$PORT (default 8787 when unset).
EXPOSE 8787
USER node
CMD ["node", "apps/backend/dist/index.js"]
