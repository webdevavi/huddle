# Container deployment

Self-host packaging for the **control plane only**. The local runner still
executes beside the repository; this image does not move Codex or credentials
into the container.

## Quick start

```bash
# from repository root
docker build -f deploy/container/Dockerfile -t huddle-control-plane:local .

# or via Compose
cd deploy/container
cp .env.example .env
docker compose up --build
```

Health endpoints:

- `GET /healthz` — process up
- `GET /readyz` — persistence reachable + auth mode reported

Point the CLI at the instance:

```bash
huddle --server http://localhost:8080 doctor network
HUDDLE_LIVE=1 huddle --server http://localhost:8080 auth login
huddle --server http://localhost:8080 codex --non-interactive --no-open
```

## Environment

See [`.env.example`](./.env.example) and
[`docs/self-host/configuration.md`](../../docs/self-host/configuration.md).
OAuth: [`docs/self-host/oauth.md`](../../docs/self-host/oauth.md).

Required for a real deployment:

- DNS / TLS or reverse proxy terminating HTTPS
- `HUDDLE_BASE_URL`
- GitHub OAuth application credentials
- Signing / session secrets
- PostgreSQL **or** durable SQLite volume

## SQLite path

Default compose uses SQLite at `/data/huddle.db` (`HUDDLE_SQLITE_PATH` /
`HUDDLE_DATABASE_URL=sqlite:///data/huddle.db`) on volume `huddle-data`.

Limits:

- Single-node / small-team self-host, not multi-replica write scale-out
- Back up `/data` before upgrades
- Do not place the SQLite file on ephemeral container rootfs

## PostgreSQL

```bash
docker compose --profile postgres up --build
```

Set `HUDDLE_DATABASE_URL=postgres://huddle:huddle@db:5432/huddle` in `.env`.

## Multi-architecture

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -f deploy/container/Dockerfile -t huddle-control-plane:latest .
```

## Related docs

- [Self-host quickstart](../../docs/self-host/quickstart.md)
- [Self-host configuration](../../docs/self-host/configuration.md)
- [OAuth setup](../../docs/self-host/oauth.md)
- [Phase 1 gate](../../docs/beta/phase-1-gate.md)
