# Self-host quickstart

Deploy the **control plane** in a container. Keep the **runner + Codex** on a machine
that has the repository.

## Prerequisites

- Docker (with Compose) or compatible runtime
- DNS and TLS (or a reverse proxy) for any non-local URL
- GitHub OAuth application for real sign-in
- Node 22+ on hosts that run `huddle` / the runner

## Stub bring-up

```bash
cd deploy/container
cp .env.example .env
# edit secrets in .env for anything beyond local smoke
docker compose up --build
```

Verify:

```bash
curl -s http://localhost:8080/healthz
huddle --server http://localhost:8080 doctor network
```

Definition of healthy (when full stack lands): synthetic two-browser + one-runner room.
The current image is a **health-endpoint stub** so packaging and env contracts can land early.

## SQLite vs PostgreSQL

- **SQLite** (`sqlite:///data/huddle.db`): small single-node installs; persist `/data`.
- **PostgreSQL**: preferred for multi-user / durable production self-host.

Details: [Configuration](./configuration.md) · [Container README](../../deploy/container/README.md)
