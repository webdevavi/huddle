import { accessSync, constants } from "node:fs";
import { delimiter } from "node:path";
import { spawnSync } from "node:child_process";
import type { CodexDetection } from "./types.js";

/** Supported major.minor band for stub detection messaging. */
export const SUPPORTED_CODEX_RANGE = "0.145.x";

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
  return version.startsWith("0.145.");
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
