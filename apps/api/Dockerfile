# syntax=docker/dockerfile:1.7
# API do Messa — build do monorepo pnpm e imagem enxuta com `pnpm deploy`.
# Contexto de build: raiz do repositório (fly.toml aponta para cá).

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# ---------- dependências (cache por lockfile) ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @messa/api...

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/domain packages/domain
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter @messa/domain --filter @messa/contracts --filter @messa/db build \
 && pnpm --filter @messa/api build \
 && pnpm --filter @messa/api --prod deploy /out

# ---------- runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production API_PORT=8080 UPLOADS_DIR=/data/uploads
# Fontes para renderizar o texto dos cartazes de QR (sharp/librsvg)
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
