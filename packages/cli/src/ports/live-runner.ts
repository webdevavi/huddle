import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SUPPORTED_CODEX_APP_SERVER } from "@huddle/codex-adapter";
import {
  createRoomWorktree,
  NodeFsPort,
  startRunnerCore,
  weakIsolationWarning,
} from "@huddle/runner-core";
import type { RunnerPort } from "./types.js";

const execFileAsync = promisify(execFile);

function slugWord(): string {
  const words = ["quiet", "swift", "amber", "cedar", "lunar", "brave", "clear", "noble"];
  return words[Math.floor(Math.random() * words.length)] ?? "quiet";
}

function makeSlug(): string {
  return `${slugWord()}-${slugWord()}`;
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return true;
  } catch {
    return false;
  }
}

export type LiveRunnerOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Live runner port: worktree via runner-core when in a git repo;
 * optional startRunnerCore when HUDDLE_LIVE_RUNNER=1.
 */
export function createLiveRunner(options: LiveRunnerOptions = {}): RunnerPort {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  return {
    kind: "runner",

    async ensureWorkspace(input: { noWorktree: boolean }): Promise<{ workspace: string }> {
      if (input.noWorktree) {
        weakIsolationWarning();
        return { workspace: "." };
      }

      const slug = makeSlug();
      const roomId = `room_${randomBytes(4).toString("hex")}`;

      if (!(await isGitRepo(cwd))) {
        return { workspace: `.huddle/worktrees/${slug}` };
      }

      const result = await createRoomWorktree(
        {
          roomId,
          roomSlug: slug,
          repoRoot: cwd,
        },
        new NodeFsPort(),
      );
      return { workspace: result.worktreePath };
    },

    async startAgent(input: { agent: "codex"; live: boolean }): Promise<{
      agent: string;
      mode: "stub" | "live";
    }> {
      const mode = input.live ? "live" : "stub";
      const agent = input.agent === "codex" ? "Codex" : input.agent;

      if (env.HUDDLE_LIVE_RUNNER === "1" && input.live) {
        const roomId = env.HUDDLE_ROOM_ID?.trim() || `room_${randomBytes(4).toString("hex")}`;
        const spawn =
          env.HUDDLE_SPAWN_CODEX === "1" || env.HUDDLE_SPAWN_CODEX === "true";
        try {
          const handle = await startRunnerCore({
            roomId,
            fence: {
              roomIncarnation: env.HUDDLE_ROOM_INCARNATION?.trim() || "inc_pending",
              runnerEpoch: Number(env.HUDDLE_RUNNER_EPOCH ?? 1) || 1,
            },
            // Adapter pin is App Server protocol version, not Codex CLI version.
            codexVersion:
              env.HUDDLE_CODEX_APP_SERVER_VERSION?.trim() || SUPPORTED_CODEX_APP_SERVER.pinned,
            env,
            worktreeRoot: cwd,
            spawnAppServer: spawn,
            ...(env.HUDDLE_CODEX_PATH?.trim()
              ? { codexPath: env.HUDDLE_CODEX_PATH.trim() }
              : {}),
          });
          const shutdown = () => {
            void handle.close();
          };
          process.once("exit", shutdown);
          process.once("SIGINT", shutdown);
          process.once("SIGTERM", shutdown);
          void handle;
        } catch {
          // Live runner bootstrap is optional; agent mode still reflects detection.
        }
      }

      return { agent, mode };
    },
  };
}

export class LiveRunnerPort implements RunnerPort {
  readonly kind = "runner" as const;
  readonly #inner: RunnerPort;

  constructor(options: LiveRunnerOptions = {}) {
    this.#inner = createLiveRunner(options);
  }

  ensureWorkspace(input: { noWorktree: boolean }): Promise<{ workspace: string }> {
    return this.#inner.ensureWorkspace(input);
  }

  startAgent(input: { agent: "codex"; live: boolean }): Promise<{
    agent: string;
    mode: "stub" | "live";
  }> {
    return this.#inner.startAgent(input);
  }
}
