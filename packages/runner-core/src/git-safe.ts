/**
 * ENG-T6: Git operations with hooks disabled.
 */

import { spawnSync } from "node:child_process";
import { sanitizeRunnerEnv } from "./env.js";

export type HuddleGitResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
};

export function runHuddleGit(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv } = { cwd: process.cwd() },
): HuddleGitResult {
  const env = sanitizeRunnerEnv(options.env ?? process.env);
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: options.cwd,
    env,
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}
