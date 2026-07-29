# Huddle

Multiplayer control for local coding agents.

Start Codex in an isolated worktree with one command, share one link, and collaborate
through structured observation, driver handoff, and explicit approvals — without a
remote shell or moving credentials into the cloud.

Product and technical requirements:

- [`docs/plans/huddle-product-technical-spec.md`](docs/plans/huddle-product-technical-spec.md)
- Design system: [`DESIGN.md`](DESIGN.md)

## Golden path

```bash
npx huddle codex
```

In this workspace after install:

```bash
pnpm install
pnpm typecheck
pnpm huddle codex --non-interactive --no-open
```

Expected shape:

```text
Huddle is ready.
…
Access:     invite-only
Share: https://huddle.dev/r/<slug>
```

First use defaults to **invite-only**. Use `--org <slug>` to restrict by organization.
The share URL is always printed; browser/clipboard success is never required for readiness.

Prerequisites: Node 22+, Git, pnpm 11.17.0 (via Corepack). Live Codex is optional —
when absent, the CLI runs in stub mode against local ports.

### Data disclosure (short)

Execution and credentials stay on the host. The control plane relays structured room
events for collaboration. Details: [`docs/concepts/data-boundary.md`](docs/concepts/data-boundary.md).

## Workspace layout

```text
apps/web                  Browser room UI (Vite + React, fixture mode)
apps/control-plane        Hono API + WS catch-up (fake auth, SQLite)
packages/cli              CLI golden path, doctor, diagnostics
packages/protocol         Versioned event protocol + state machines
packages/authz            Capability / lease / approval evidence contracts
packages/testkit          Fake clock/IDs and fault-transport helpers
packages/runner-core      Local WAL, worktree, policy, redaction, fencing
packages/codex-adapter    Codex App Server adapter + fake fixtures
packages/persistence      SQLite store + Postgres ports
deploy/container          Control-plane container stub + env docs
deploy/migrations         SQL schema
```

## Documentation

| Topic | Doc |
|---|---|
| Host a room | [`docs/getting-started/host-a-room.md`](docs/getting-started/host-a-room.md) |
| Join a room | [`docs/getting-started/join-a-room.md`](docs/getting-started/join-a-room.md) |
| Data boundary | [`docs/concepts/data-boundary.md`](docs/concepts/data-boundary.md) |
| Roles / driver / approvals | [`docs/concepts/roles-driver-approvals.md`](docs/concepts/roles-driver-approvals.md) |
| Self-host quickstart | [`docs/self-host/quickstart.md`](docs/self-host/quickstart.md) |
| Self-host configuration | [`docs/self-host/configuration.md`](docs/self-host/configuration.md) |

## Development

Requires Node 22 and pnpm 11.17.0 (via Corepack).

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build:web

# Web room UI (fixture mode, no live server)
pnpm --filter @huddle/web dev
# open http://localhost:5173/#/fixtures

# Control plane (fake auth header x-huddle-user)
pnpm --filter @huddle/control-plane dev
# or: pnpm dev -- --live
```

`pnpm dev` prints contributor guidance by default. Pass `--live` to start the
control-plane via tsx.

### Live local wiring

| Variable | Where | Purpose |
|---|---|---|
| `VITE_HUDDLE_API_URL` | `apps/web` | When set, the web app uses `LiveControlPlaneClient` against this API base (otherwise Mock fixtures). |
| `HUDDLE_LIVE=1` | CLI | Prefer HTTP control-plane + live runner ports (also enabled when `--server` is not the default). |
| `HUDDLE_DATABASE_URL` | control-plane / self-host | Postgres DSN when not using SQLite (`HUDDLE_SQLITE_PATH`). |
| `HUDDLE_USER` | CLI | Fake identity for `x-huddle-user` (`userId:DisplayName`). |

Example:

```bash
# terminal 1
pnpm dev -- --live

# terminal 2
VITE_HUDDLE_API_URL=http://127.0.0.1:8787 pnpm --filter @huddle/web dev

# terminal 3
HUDDLE_LIVE=1 HUDDLE_SERVER=http://127.0.0.1:8787 pnpm huddle auth login
```

CLI smoke:

```bash
pnpm huddle --help
pnpm huddle doctor --json
pnpm huddle diagnostics create --non-interactive
```

## Self-host container stub

```bash
cd deploy/container
cp .env.example .env
docker compose up --build
```

SQLite default path: `sqlite:///data/huddle.db` on volume `huddle-data`. See
[`deploy/container/README.md`](deploy/container/README.md).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
