import { createHuddleError, type HuddleError } from "@huddle/protocol";
import type { FsPort } from "./fs-port.js";
import { StorageUnavailableError } from "./fs-port.js";
import { roomLockPath, roomMetadataDir } from "./metadata.js";
import type { RunnerFence } from "./epoch.js";

export type RoomLock = {
  release(): Promise<void>;
  fence: RunnerFence;
};

/**
 * Exclusive local room lock. Single writer owns the room/provider process (§46).
 */
export async function acquireRoomLock(
  roomId: string,
  fence: RunnerFence,
  fs: FsPort,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: true; lock: RoomLock } | { ok: false; error: HuddleError }> {
  const meta = roomMetadataDir(roomId, env);
  const lockPath = roomLockPath(roomId, env);
  try {
    await fs.mkdir(meta, { recursive: true, mode: 0o700 });
    const payload = JSON.stringify({
      roomIncarnation: fence.roomIncarnation,
      runnerEpoch: fence.runnerEpoch,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    });
    await fs.openExclusive(lockPath, `${payload}\n`);
    return {
      ok: true,
      lock: {
        fence,
        async release() {
          try {
            await fs.unlink(lockPath);
          } catch {
            // already released
          }
        },
      },
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      return {
        ok: false,
        error: createHuddleError({
          code: "RUNNER_EPOCH_STALE",
          message:
            "Room lock is held by another runner. Stop the other process or wait for takeover fencing.",
          retryable: true,
          retryAfterMs: 1000,
          diagnosticId: `lock-${roomId}`,
        }),
      };
    }
    if (code === "ENOSPC" || code === "EACCES") {
      throw new StorageUnavailableError(
        code === "ENOSPC" ? "Disk full while acquiring room lock" : "Permission denied for room lock",
      );
    }
    throw err;
  }
}
