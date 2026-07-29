#!/usr/bin/env node
/* global console, process */
/**
 * Contributor `pnpm dev` entry.
 * Default: print stub guidance. Pass `--live` to start the control-plane via tsx.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const live = args.includes("--live");

if (!live) {
  const lines = [
    "huddle: pnpm dev (stub)",
    "",
    "Pass --live to start apps/control-plane locally:",
    "  pnpm dev -- --live",
    "  node ./scripts/dev.mjs --live",
    "",
    "Planned local services:",
    "  - apps/web (VITE_HUDDLE_API_URL=http://127.0.0.1:8787)",
    "  - apps/control-plane (HUDDLE_LIVE=1 / HUDDLE_DATABASE_URL)",
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
} else {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const cli = join(root, "apps/control-plane/src/cli.ts");
  console.log("huddle: starting control-plane (live)…");
  console.log(`  tsx ${cli}`);
  console.log("  Fake auth: POST /v1/auth/session with x-huddle-user: alice:Alice");
  console.log("");

  const child = spawn("pnpm", ["--filter", "@huddle/control-plane", "exec", "tsx", "src/cli.ts"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: process.env.PORT ?? "8787",
      HOST: process.env.HOST ?? "127.0.0.1",
      HUDDLE_SQLITE_PATH: process.env.HUDDLE_SQLITE_PATH ?? ":memory:",
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}
