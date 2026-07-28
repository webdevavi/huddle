#!/usr/bin/env node
/* global console, process */
/**
 * Contributor `pnpm dev` stub (AC-9 partial / DX-T9 subset).
 * Real orchestration lands when web, control-plane, fake auth/Codex, and DB fixtures exist.
 */
const lines = [
  "huddle: pnpm dev (stub)",
  "",
  "Planned local services (not started yet):",
  "  - apps/web",
  "  - apps/control-plane",
  "  - fake identity / GitHub device flow",
  "  - fake Codex App Server",
  "  - seeded rooms",
  "  - local PostgreSQL (default) or SQLite via a documented flag",
  "",
  "No production credentials are required for the contributor loop.",
  "",
  "Useful commands today:",
  "  pnpm lint",
  "  pnpm typecheck",
  "  pnpm test",
  "  pnpm exec huddle doctor --json",
  "  pnpm exec huddle codex --non-interactive --no-open",
  "",
  "Self-host container stub: deploy/container (see docs/self-host/quickstart.md)",
];

console.log(lines.join("\n"));
process.exitCode = 0;
