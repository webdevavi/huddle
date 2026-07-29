#!/usr/bin/env node
/* global console, process */
/**
 * Backward-compatible stub entry. Prefer `scripts/dev.mjs`.
 * Forwards `--live` to the live control-plane launcher.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const script = join(dirname(fileURLToPath(import.meta.url)), "dev.mjs");
const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
