# Host a room

Start from a Git repository:

```bash
npx huddle codex
```

Or, from this monorepo after `pnpm install` and `pnpm --filter @huddle/cli typecheck`:

```bash
pnpm exec huddle codex --non-interactive --no-open
```

## What happens

1. Preflight checks Node, Git, workspace, and local storage under `.huddle/`.
2. Access defaults to **invite-only** (no organization prompt before first value).
3. Huddle creates an isolated worktree path (stub until runner-core lands).
4. The share URL is **always printed**. Browser open and clipboard are optional.

Example output:

```text
Huddle is ready.

Repository: local git repo
Workspace:  .huddle/worktrees/quiet-sunrise
Agent:      Codex (stub)
Policy:     Workspace writes allowed; network and Git publish require approval
Access:     invite-only

Share: https://huddle.dev/r/quiet-sunrise
```

## Useful options

```bash
huddle codex --name "Fix checkout timeout"
huddle codex --org acme
huddle codex --no-worktree
huddle --server https://huddle.acme.internal codex
```

- `--org <slug>` — restrict to a GitHub organization (explicit override).
- `--no-worktree` — weaker isolation; prefer the default worktree.
- `--server <url>` — self-hosted control plane.
- `--non-interactive` — fail closed instead of prompting (contributor/CI friendly).

## Diagnose setup

```bash
huddle doctor
huddle doctor codex
huddle doctor --json
```

Next: [Join a room](./join-a-room.md) · [Data boundary](../concepts/data-boundary.md)
