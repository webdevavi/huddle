# Multi-architecture control-plane container (control plane only).
# Runner still executes beside the repository — this image does not include Codex.

FROM node:22-bookworm-slim AS build

WORKDIR /src
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @huddle/control-plane... typecheck

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    HUDDLE_HOST=0.0.0.0 \
    HUDDLE_PORT=8080 \
    HUDDLE_SQLITE_PATH=/data/huddle.db \
    HUDDLE_DATA_DIR=/data \
    HUDDLE_TELEMETRY=off \
    HUDDLE_MIGRATIONS_PATH=/app/deploy/migrations/001_control_plane.sql

RUN useradd --system --uid 10001 --create-home huddle \
  && mkdir -p /data \
  && chown -R huddle:huddle /data \
  && corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY --from=build --chown=huddle:huddle /src /app

USER huddle
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/control-plane/dist/cli.js"]
