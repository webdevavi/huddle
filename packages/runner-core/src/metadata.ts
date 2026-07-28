import { homedir } from "node:os";
import { join } from "node:path";

/** Host metadata root — outside repository and worktree (§47 / binding answer). */
export function huddleHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env["HUDDLE_HOME"] && env["HUDDLE_HOME"].length > 0) {
    return env["HUDDLE_HOME"];
  }
  return join(homedir(), ".huddle");
}

export function roomMetadataDir(
  roomId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(huddleHome(env), "rooms", roomId);
}

export function roomWalDir(roomId: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(roomMetadataDir(roomId, env), "wal");
}

export function roomLockPath(roomId: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(roomMetadataDir(roomId, env), "room.lock");
}
