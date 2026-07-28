import { join } from "node:path";
import { createHuddleError, type HuddleError } from "@huddle/protocol";
import type { RunnerFence } from "../epoch.js";
import { assertRunnerEpoch } from "../epoch.js";
import type { FsPort } from "../fs-port.js";
import { StorageUnavailableError } from "../fs-port.js";
import { roomWalDir } from "../metadata.js";
import {
  encodeCheckpointFrame,
  encodeHeaderFrame,
  encodeRecordFrame,
  recoverSegment,
  type DecodedFrame,
  type WalCheckpointPayload,
  type WalRecordPayload,
  type WalRecordType,
  WAL_VERSION,
} from "./format.js";

export type WalAppendInput = {
  recordId: string;
  recordType: WalRecordType;
  body: unknown;
};

export type WalOpenResult =
  | { ok: true; wal: FramedWal }
  | { ok: false; error: HuddleError };

export class FramedWal {
  readonly roomId: string;
  readonly fence: RunnerFence;
  readonly dir: string;
  #fs: FsPort;
  #segmentPath: string;
  #segmentName: string;
  #lastDurableRecordId: string | null = null;
  #lastServerAckId: string | null = null;
  #records: WalRecordPayload[] = [];
  #disabled = false;

  private constructor(
    roomId: string,
    fence: RunnerFence,
    dir: string,
    fs: FsPort,
    segmentPath: string,
    segmentName: string,
  ) {
    this.roomId = roomId;
    this.fence = fence;
    this.dir = dir;
    this.#fs = fs;
    this.#segmentPath = segmentPath;
    this.#segmentName = segmentName;
  }

  get disabled(): boolean {
    return this.#disabled;
  }

  get records(): readonly WalRecordPayload[] {
    return this.#records;
  }

  get lastDurableRecordId(): string | null {
    return this.#lastDurableRecordId;
  }

  static async open(
    roomId: string,
    fence: RunnerFence,
    fs: FsPort,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<WalOpenResult> {
    const dir = roomWalDir(roomId, env);
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      return mapStorageError(err, roomId);
    }

    const segmentName = "segment-0001.wal";
    const segmentPath = join(dir, segmentName);
    const exists = await fs.exists(segmentPath);

    if (!exists) {
      const header = encodeHeaderFrame({
        roomIncarnation: fence.roomIncarnation,
        runnerEpoch: fence.runnerEpoch,
      });
      try {
        await fs.writeFile(segmentPath, header, { mode: 0o600 });
      } catch (err) {
        return mapStorageError(err, roomId);
      }
      const wal = new FramedWal(roomId, fence, dir, fs, segmentPath, segmentName);
      await wal.#writeCheckpoint();
      return { ok: true, wal };
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(segmentPath);
    } catch (err) {
      return mapStorageError(err, roomId);
    }

    const recovered = recoverSegment(buffer, { failClosedOnMidCorruption: true });
    if (recovered.failClosed) {
      return {
        ok: false,
        error: createHuddleError({
          code: "STORAGE_UNAVAILABLE",
          message:
            "WAL corruption detected inside an acknowledged prefix. Explicit recovery is required before execution can continue.",
          retryable: false,
          diagnosticId: `wal-corrupt-${roomId}`,
        }),
      };
    }

    if (recovered.truncatedBytes > 0) {
      const kept = buffer.subarray(0, buffer.length - recovered.truncatedBytes);
      try {
        await fs.writeFile(segmentPath, kept, { mode: 0o600 });
      } catch (err) {
        return mapStorageError(err, roomId);
      }
    }

    const headerFrame = recovered.frames.find((f) => f.type === "header");
    if (headerFrame && headerFrame.type === "header") {
      if (
        headerFrame.payload.roomIncarnation === fence.roomIncarnation &&
        headerFrame.payload.runnerEpoch > fence.runnerEpoch
      ) {
        return {
          ok: false,
          error: createHuddleError({
            code: "RUNNER_EPOCH_STALE",
            message: "WAL was written by a newer runner epoch.",
            retryable: false,
            diagnosticId: `wal-epoch-${roomId}`,
          }),
        };
      }
      if (headerFrame.payload.roomIncarnation !== fence.roomIncarnation) {
        return {
          ok: false,
          error: createHuddleError({
            code: "RUNNER_EPOCH_STALE",
            message: "WAL room incarnation does not match runner fence.",
            retryable: false,
            diagnosticId: `wal-inc-${roomId}`,
          }),
        };
      }
    }

    const wal = new FramedWal(roomId, fence, dir, fs, segmentPath, segmentName);
    for (const frame of recovered.frames) {
      wal.#ingestFrame(frame);
    }
    return { ok: true, wal };
  }

  async append(
    input: WalAppendInput,
    fence: RunnerFence,
  ): Promise<{ ok: true; record: WalRecordPayload } | { ok: false; error: HuddleError }> {
    if (this.#disabled) {
      return {
        ok: false,
        error: createHuddleError({
          code: "STORAGE_UNAVAILABLE",
          message: "Host storage unavailable. Execution-affecting input is disabled.",
          retryable: true,
          diagnosticId: `wal-disabled-${this.roomId}`,
        }),
      };
    }

    const epochCheck = assertRunnerEpoch(this.fence, fence, `wal-append-${this.roomId}`);
    if (!epochCheck.ok) return epochCheck;

    if (fence.runnerEpoch !== this.fence.runnerEpoch) {
      return {
        ok: false,
        error: createHuddleError({
          code: "RUNNER_EPOCH_STALE",
          message: "Stale runner epoch rejected by WAL append.",
          retryable: false,
          diagnosticId: `wal-stale-${this.roomId}`,
        }),
      };
    }

    const record: WalRecordPayload = {
      recordId: input.recordId,
      recordType: input.recordType,
      roomIncarnation: fence.roomIncarnation,
      runnerEpoch: fence.runnerEpoch,
      body: input.body,
    };

    const frame = encodeRecordFrame(record, WAL_VERSION);
    try {
      await this.#fs.appendFile(this.#segmentPath, frame);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOSPC" || code === "EACCES") {
        this.#disabled = true;
        throw new StorageUnavailableError(
          code === "ENOSPC" ? "Disk full during WAL append" : "Permission denied during WAL append",
        );
      }
      throw err;
    }

    this.#records.push(record);
    this.#lastDurableRecordId = record.recordId;
    await this.#writeCheckpoint();
    return { ok: true, record };
  }

  async acknowledgeServer(recordId: string): Promise<void> {
    this.#lastServerAckId = recordId;
    await this.#writeCheckpoint();
  }

  async compact(): Promise<void> {
    if (this.#disabled) return;

    const ackIndex = this.#lastServerAckId
      ? this.#records.findIndex((r) => r.recordId === this.#lastServerAckId)
      : -1;
    const keep = ackIndex >= 0 ? this.#records.slice(ackIndex + 1) : [...this.#records];

    const parts: Buffer[] = [
      encodeHeaderFrame({
        roomIncarnation: this.fence.roomIncarnation,
        runnerEpoch: this.fence.runnerEpoch,
      }),
    ];
    for (const record of keep) {
      parts.push(encodeRecordFrame(record));
    }
    const checkpoint: WalCheckpointPayload = {
      lastDurableRecordId: this.#lastDurableRecordId,
      lastServerAckId: this.#lastServerAckId,
      segmentName: this.#segmentName,
    };
    parts.push(encodeCheckpointFrame(checkpoint));
    const next = Buffer.concat(parts);
    const tmp = `${this.#segmentPath}.tmp`;
    try {
      await this.#fs.writeFile(tmp, next, { mode: 0o600 });
      await this.#fs.rename(tmp, this.#segmentPath);
      this.#records = keep;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOSPC" || code === "EACCES") {
        this.#disabled = true;
        throw new StorageUnavailableError("Host storage unavailable during compaction");
      }
      throw err;
    }
  }

  #ingestFrame(frame: DecodedFrame): void {
    if (frame.type === "record") {
      this.#records.push(frame.payload);
      this.#lastDurableRecordId = frame.payload.recordId;
    } else if (frame.type === "checkpoint") {
      this.#lastDurableRecordId = frame.payload.lastDurableRecordId;
      this.#lastServerAckId = frame.payload.lastServerAckId;
    }
  }

  async #writeCheckpoint(): Promise<void> {
    const checkpoint: WalCheckpointPayload = {
      lastDurableRecordId: this.#lastDurableRecordId,
      lastServerAckId: this.#lastServerAckId,
      segmentName: this.#segmentName,
    };
    try {
      await this.#fs.appendFile(this.#segmentPath, encodeCheckpointFrame(checkpoint));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOSPC" || code === "EACCES") {
        this.#disabled = true;
        throw new StorageUnavailableError("Host storage unavailable during checkpoint");
      }
      throw err;
    }
  }
}

function mapStorageError(err: unknown, roomId: string): { ok: false; error: HuddleError } {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOSPC" || code === "EACCES") {
    return {
      ok: false,
      error: createHuddleError({
        code: "STORAGE_UNAVAILABLE",
        message: "Host storage unavailable. Check disk space and permissions for ~/.huddle.",
        retryable: true,
        diagnosticId: `wal-fs-${roomId}`,
      }),
    };
  }
  throw err;
}
