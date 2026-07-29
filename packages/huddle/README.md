# `huddle` npm package

Public CLI entry for:

```bash
npx huddle codex
```

This package is a thin bin wrapper around `@huddle/cli`. Publishing requires an npm
token and coordinated version bumps across the `@huddle/*` dependency graph.

Until the first release, install from this monorepo:

```bash
pnpm install
pnpm huddle codex --non-interactive --no-open
```
