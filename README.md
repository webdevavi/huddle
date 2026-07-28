# Huddle

Multiplayer control for local coding agents.

This repository is an early monorepo scaffold. Product and technical requirements
live in:

- [`docs/plans/huddle-product-technical-spec.md`](docs/plans/huddle-product-technical-spec.md)

## Golden path

From a Git repository (stub control plane / runner until later lanes land):

```bash
npx huddle codex
```

In this workspace after install:

```bash
pnpm install
pnpm --filter @huddle/cli typecheck
pnpm exec huddle codex --non-interactive --no-open
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
when absent, the CLI runs in stub mode. Clean up local metadata with
`huddle room clean <room>` when that path is fully wired.

### Data disclosure (short)

Execution and credentials stay on the host. The control plane relays structured room
events for collaboration. Details: [`docs/concepts/data-boundary.md`](docs/concepts/data-boundary.md).

## Workspace layout

```text
apps/web                  Browser room UI (Vite + React)
apps/control-plane        Hosted/self-hosted API (stub)
packages/cli              CLI golden path, doctor, diagnostics
packages/protocol         Versioned event protocol + state machines
packages/authz            Capability / lease / approval evidence contracts
packages/testkit          Fake clock/IDs and fault-transport helpers
packages/runner-core      Local runner (stub)
packages/codex-adapter    Codex App Server adapter (stub)
packages/persistence      PostgreSQL/SQLite ports (stub)
deploy/container          Control-plane container stub + env docs
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
pnpm dev          # stub: prints planned services (see below)
pnpm lint
pnpm typecheck
pnpm test

# Web room UI (fixture mode, no live server)
pnpm --filter @huddle/web dev
# open http://localhost:5173/#/fixtures
```

`pnpm dev` is currently a **documented stub**. When web, control-plane, fake identity,
fake Codex, and database fixtures land, it will start those services. Today it explains
the planned loop and exits successfully so contributor docs stay accurate.

Optional SQLite contributor mode will be selected via a documented flag once persistence
wiring exists; default long-term target remains local PostgreSQL for `pnpm dev`.

CLI smoke:

```bash
pnpm exec huddle --help
pnpm exec huddle doctor --json
pnpm exec huddle diagnostics create --non-interactive
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
