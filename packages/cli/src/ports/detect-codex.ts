import { accessSync, constants } from "node:fs";
import { delimiter } from "node:path";
import { spawnSync } from "node:child_process";
import { SUPPORTED_CODEX_CLI, parseCodexVersion } from "@huddle/codex-adapter";
import type { CodexDetection } from "./types.js";

/** Supported Codex CLI band for doctor / preflight messaging. */
export const SUPPORTED_CODEX_RANGE = SUPPORTED_CODEX_CLI.rangeLabel;

function which(command: string): string | undefined {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = `${dir}/${command}`;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

function parseVersion(raw: string): string | undefined {
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  return match?.[1];
}

function isSupported(version: string): boolean {
  const parsed = parseCodexVersion(version);
  const min = parseCodexVersion(SUPPORTED_CODEX_CLI.min);
  if (!parsed || !min) return false;
  for (let i = 0; i < 3; i += 1) {
    const left = parsed[i]!;
    const right = min[i]!;
    if (left !== right) return left > right;
  }
  return true;
}

/**
 * Detect a local Codex binary. Live start remains optional; detection only
 * informs doctor and whether the golden path can claim a live mode.
 */
export function detectCodex(): CodexDetection {
  const path = which("codex");
  if (!path) {
    return { found: false, supported: false };
  }

  const result = spawnSync(path, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  const raw = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const version = parseVersion(raw);
  if (!version) {
    return { found: true, path, supported: false };
  }
  return {
    found: true,
    path,
    version,
    supported: isSupported(version),
  };
}
