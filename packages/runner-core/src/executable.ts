/**
 * ENG-T6: reject unsafe executable lookups (writable / repo-local PATH entries).
 */

import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";

export type ExecutableLookupResult =
  | { ok: true; path: string }
  | { ok: false; reason: "not_found" | "unsafe_path" | "not_executable"; path?: string };

function isWritableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve `command` against PATH, rejecting writable directories and paths inside `worktreeRoot`.
 */
export function resolveExecutable(
  command: string,
  options: {
    pathEnv?: string;
    worktreeRoot?: string;
    pathExt?: string;
  } = {},
): ExecutableLookupResult {
  if (command.includes("/") || command.includes("\\") || isAbsolute(command)) {
    const abs = resolve(command);
    if (options.worktreeRoot) {
      const root = resolve(options.worktreeRoot);
      if (abs === root || abs.startsWith(root + "/") || abs.startsWith(root + "\\")) {
        return { ok: false, reason: "unsafe_path", path: abs };
      }
    }
    try {
      accessSync(abs, constants.X_OK);
      return { ok: true, path: abs };
    } catch {
      return { ok: false, reason: "not_executable", path: abs };
    }
  }

  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? (options.pathExt ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];

  for (const dir of dirs) {
    const absDir = resolve(dir);
    if (isWritableDir(absDir)) {
      continue;
    }
    if (options.worktreeRoot) {
      const root = resolve(options.worktreeRoot);
      if (absDir === root || absDir.startsWith(root + "/") || absDir.startsWith(root + "\\")) {
        continue;
      }
    }
    for (const ext of exts) {
      const candidate = join(absDir, command + ext);
      try {
        const st = statSync(candidate);
        if (!st.isFile()) continue;
        accessSync(candidate, constants.X_OK);
        return { ok: true, path: candidate };
      } catch {
        // try next
      }
    }
  }

  return { ok: false, reason: "not_found" };
}
