# Container deployment (Lane E / AC-11)

Self-host packaging for the **control plane only**. The local runner still
executes beside the repository; this image does not move Codex or credentials
into the container.

## Quick start (stub)

```bash
cd deploy/container
cp .env.example .env
docker compose up --build
```

Health endpoints (stub):

- `GET /healthz` — process up
- `GET /readyz` — ready to accept traffic (same as health in the stub)

Point the CLI at the instance:

```bash
huddle --server http://localhost:8080 doctor network
huddle --server http://localhost:8080 codex --non-interactive --no-open
```

## Environment

See [`.env.example`](./.env.example) (copy to `.env` for local overrides) and
[`docs/self-host/configuration.md`](../../docs/self-host/configuration.md).

Required for a real deployment (documented now; enforced when control-plane lands):

- DNS / TLS or reverse proxy terminating HTTPS
- `HUDDLE_BASE_URL`
- GitHub OAuth application credentials
- Signing / session secrets
- PostgreSQL **or** constrained SQLite volume

## SQLite path

Default compose uses:

```text
HUDDLE_DATABASE_URL=sqlite:///data/huddle.db
```

mounted at Docker volume `huddle-data` → `/data`.

Limits (document for operators):

- Intended for single-node / small-team self-host, not multi-replica write scale-out
- Back up `/data` (or the named volume) before upgrades
- Do not place the SQLite file on ephemeral container rootfs
- Migration lock and backup/restore procedures land with persistence (Lane C)

## Multi-architecture

Build for amd64/arm64 when publishing (stub command):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t huddle-control-plane:stub .
```

## Related docs

- [Self-host quickstart](../../docs/self-host/quickstart.md)
- [Self-host configuration](../../docs/self-host/configuration.md)
- Product/technical spec §35 / §52 / §61
