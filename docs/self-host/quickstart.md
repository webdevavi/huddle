# Self-host quickstart

Deploy the **control plane** in a container. Keep the **runner + Codex** on a machine
that has the repository.

## Prerequisites

- Docker (with Compose) or compatible runtime
- DNS and TLS (or a reverse proxy) for any non-local URL
- GitHub OAuth application for real sign-in ([OAuth setup](./oauth.md))
- Node 22+ on hosts that run `huddle` / the runner

## Bring-up (SQLite)

```bash
cd deploy/container
cp .env.example .env
# edit secrets in .env for anything beyond local smoke
docker compose up --build
```

Verify:

```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/readyz
huddle --server http://localhost:8080 doctor network
```

Definition of healthy: synthetic two-browser + one-runner room (`pnpm test:e2e` against
the instance, or the acceptance scenario in [`docs/beta/phase-1-gate.md`](../beta/phase-1-gate.md)).

## PostgreSQL profile

```bash
# in deploy/container/.env
HUDDLE_DATABASE_URL=postgres://huddle:huddle@db:5432/huddle

docker compose --profile postgres up --build
```

Wire `control-plane` to `db` via the compose network (set `HUDDLE_DATABASE_URL` to the
`db` hostname as above).

## SQLite vs PostgreSQL

- **SQLite** (`sqlite:///data/huddle.db` or `HUDDLE_SQLITE_PATH=/data/huddle.db`): small single-node installs; persist `/data`.
- **PostgreSQL**: preferred for multi-user / durable production self-host.

Details: [Configuration](./configuration.md) · [OAuth](./oauth.md) · [Container README](../../deploy/container/README.md)
