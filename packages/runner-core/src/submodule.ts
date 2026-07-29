/**
 * ENG-T6: submodule policy — uninitialized and read-only by default.
 */

import { join } from "node:path";
import type { FsPort } from "./fs-port.js";

export type SubmodulePolicyResult =
  | { ok: true; initialized: false }
  | { ok: true; initialized: true; readOnly: true }
  | { ok: false; reason: "gitmodules_present_requires_policy"; path: string };

/**
 * By default Huddle does not initialize submodules. Presence of `.gitmodules`
 * without an explicit policy grant is reported so callers can require approval.
 */
export async function assertSubmodulePolicy(
  worktreeRoot: string,
  fs: FsPort,
  options: { allowInitializedReadOnly?: boolean } = {},
): Promise<SubmodulePolicyResult> {
  const gitmodules = join(worktreeRoot, ".gitmodules");
  if (!(await fs.exists(gitmodules))) {
    return { ok: true, initialized: false };
  }
  if (options.allowInitializedReadOnly) {
    return { ok: true, initialized: true, readOnly: true };
  }
  return { ok: false, reason: "gitmodules_present_requires_policy", path: gitmodules };
}
