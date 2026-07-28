import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FsPort } from "./fs-port.js";

const execFileAsync = promisify(execFile);

export type WorktreeSpec = {
  roomId: string;
  roomSlug: string;
  repoRoot: string;
  baseRef?: string;
};

export type WorktreeResult = {
  branch: string;
  worktreePath: string;
  baseCommit: string;
  gitCommonDir: string;
};

/**
 * Create an isolated Git worktree:
 *   branch: huddle/<room-slug>
 *   worktree: <git-common-dir>/huddle-worktrees/<room-id>
 */
export async function createRoomWorktree(
  spec: WorktreeSpec,
  fs: FsPort,
  options: { gitExec?: typeof execFileAsync } = {},
): Promise<WorktreeResult> {
  const git = options.gitExec ?? execFileAsync;
  const { stdout: commonDirRaw } = await git("git", ["rev-parse", "--git-common-dir"], {
    cwd: spec.repoRoot,
  });
  const commonDir = commonDirRaw.trim();
  const gitCommonDir = await fs.realpath(
    isAbsolutePath(commonDir) ? commonDir : join(spec.repoRoot, commonDir),
  );

  const baseRef = spec.baseRef ?? "HEAD";
  const { stdout: baseCommitRaw } = await git("git", ["rev-parse", baseRef], {
    cwd: spec.repoRoot,
  });
  const baseCommit = baseCommitRaw.trim();

  const branch = `huddle/${spec.roomSlug}`;
  const worktreePath = join(gitCommonDir, "huddle-worktrees", spec.roomId);

  await fs.mkdir(join(gitCommonDir, "huddle-worktrees"), { recursive: true, mode: 0o700 });

  try {
    await git("git", ["rev-parse", "--verify", branch], { cwd: spec.repoRoot });
  } catch {
    await git("git", ["branch", branch, baseCommit], { cwd: spec.repoRoot });
  }

  if (!(await fs.exists(worktreePath))) {
    await git("git", ["worktree", "add", worktreePath, branch], { cwd: spec.repoRoot });
  }

  return {
    branch,
    worktreePath: await fs.realpath(worktreePath),
    baseCommit,
    gitCommonDir,
  };
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

export type WeakIsolationWarning = {
  mode: "no_worktree";
  message: string;
};

export function weakIsolationWarning(): WeakIsolationWarning {
  return {
    mode: "no_worktree",
    message:
      "Weak isolation: the agent may modify the current working tree. Prefer the default worktree mode for shared rooms.",
  };
}
