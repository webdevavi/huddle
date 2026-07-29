import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolveExecutable } from "./executable.js";
import { sanitizeRunnerEnv } from "./env.js";

export type CodexAppServerProcess = {
  child: ChildProcessWithoutNullStreams;
  executable: string;
  kill(): void;
};

export type SpawnCodexAppServerOptions = {
  worktreeRoot: string;
  env?: NodeJS.ProcessEnv;
  /** Explicit Codex binary; otherwise resolved from PATH safely. */
  codexPath?: string;
  args?: string[];
};

/**
 * Spawn `codex app-server` with a sanitized environment beside the worktree.
 * Caller owns stdin/stdout JSONL wiring to CodexAdapter.
 */
export function spawnCodexAppServer(
  options: SpawnCodexAppServerOptions,
): CodexAppServerProcess {
  const env = sanitizeRunnerEnv(options.env ?? process.env);
  const lookup = {
    worktreeRoot: options.worktreeRoot,
    ...(env.PATH !== undefined ? { pathEnv: env.PATH } : {}),
  };
  const resolved = options.codexPath
    ? resolveExecutable(options.codexPath, lookup)
    : resolveExecutable("codex", lookup);

  if (!resolved.ok) {
    throw new Error(
      `Unable to resolve a safe Codex executable (${resolved.reason}${resolved.path ? `: ${resolved.path}` : ""}).`,
    );
  }

  const args = options.args ?? ["app-server"];
  const child = spawn(resolved.path, args, {
    cwd: options.worktreeRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return {
    child,
    executable: resolved.path,
    kill() {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    },
  };
}
