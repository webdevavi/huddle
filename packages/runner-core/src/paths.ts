import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import type { FsPort } from "./fs-port.js";

export type PathCheckResult =
  | { ok: true; canonical: string }
  | { ok: false; reason: "escape" | "outside_root" | "invalid"; path: string };

/**
 * Canonicalize a candidate path and ensure it stays inside `root`
 * after symlink resolution (§47 / ENG-T6 path escape).
 */
export async function assertPathInsideRoot(
  root: string,
  candidate: string,
  fs: FsPort,
): Promise<PathCheckResult> {
  let rootCanonical: string;
  try {
    rootCanonical = await fs.realpath(root);
  } catch {
    rootCanonical = resolve(root);
  }

  const absolute = isAbsolute(candidate) ? candidate : join(rootCanonical, candidate);
  const normalized = normalize(absolute);

  const relativeProbe = stripRootPrefix(normalized, rootCanonical);
  if (relativeProbe === null || relativeProbe.startsWith(`..${sep}`) || relativeProbe === "..") {
    return { ok: false, reason: "escape", path: candidate };
  }

  if (await fs.exists(normalized)) {
    let real: string;
    try {
      real = await fs.realpath(normalized);
    } catch {
      return { ok: false, reason: "invalid", path: candidate };
    }
    const after = stripRootPrefix(real, rootCanonical);
    if (after === null || after.startsWith(`..${sep}`) || after === "..") {
      return { ok: false, reason: "escape", path: candidate };
    }
    return { ok: true, canonical: real };
  }

  const parent = normalize(join(normalized, ".."));
  if (await fs.exists(parent)) {
    let parentReal: string;
    try {
      parentReal = await fs.realpath(parent);
    } catch {
      return { ok: false, reason: "invalid", path: candidate };
    }
    const leaf = normalized.slice(parent.length).replace(/^[\\/]/, "");
    const combined = join(parentReal, leaf);
    const after = stripRootPrefix(combined, rootCanonical);
    if (after === null || after.startsWith(`..${sep}`) || after === "..") {
      return { ok: false, reason: "escape", path: candidate };
    }
    return { ok: true, canonical: combined };
  }

  const after = stripRootPrefix(normalized, rootCanonical);
  if (after === null) {
    return { ok: false, reason: "outside_root", path: candidate };
  }
  return { ok: true, canonical: normalized };
}

function stripRootPrefix(path: string, root: string): string | null {
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (path === root) return "";
  if (path.startsWith(rootWithSep)) return path.slice(rootWithSep.length);
  if (path.toLowerCase() === root.toLowerCase()) return "";
  if (path.toLowerCase().startsWith(rootWithSep.toLowerCase())) {
    return path.slice(rootWithSep.length);
  }
  return null;
}

export async function rejectWorkspaceEscape(
  worktreeRoot: string,
  paths: readonly string[],
  fs: FsPort,
): Promise<PathCheckResult> {
  for (const path of paths) {
    const result = await assertPathInsideRoot(worktreeRoot, path, fs);
    if (!result.ok) return result;
  }
  return { ok: true, canonical: worktreeRoot };
}
