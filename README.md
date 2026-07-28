# Huddle

Multiplayer control for local coding agents.

This repository is an early monorepo scaffold. Product and technical requirements
live in:

- [`docs/plans/huddle-product-technical-spec.md`](docs/plans/huddle-product-technical-spec.md)

## Workspace layout

```text
apps/web                  Browser room UI (Vite + React)
apps/control-plane        Hosted/self-hosted API (stub)
packages/cli              CLI entry (stub)
packages/protocol         Versioned event protocol + state machines
packages/authz            Capability / lease / approval evidence contracts
packages/testkit          Fake clock/IDs and fault-transport helpers
packages/runner-core      Local runner (stub)
packages/codex-adapter    Codex App Server adapter (stub)
packages/persistence      PostgreSQL/SQLite ports (stub)
deploy/container          Container packaging placeholder
```

## Development

Requires Node 22 and pnpm 11.17.0 (via Corepack).

```bash
corepack enable
pnpm install
pnpm lint
pnpm typecheck
pnpm test

# Web room UI (fixture mode, no live server)
pnpm --filter @huddle/web dev
# open http://localhost:5173/#/fixtures
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
