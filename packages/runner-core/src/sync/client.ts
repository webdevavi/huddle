import type { RoomEvent } from "@huddle/protocol";
import type { RunnerFence } from "../epoch.js";
import { assertRunnerEpoch } from "../epoch.js";

export type SyncAck = {
  lastAckedRecordId: string;
  serverCursor: string;
};

export type OutboundSyncBatch = {
  fence: RunnerFence;
  recordId: string;
  events: RoomEvent[];
};

export interface OutboundSyncClient {
  ingest(batch: OutboundSyncBatch): Promise<SyncAck>;
}

/** Fake outbound sync client for local tests — no real network. */
export class FakeOutboundSyncClient implements OutboundSyncClient {
  readonly ingested: OutboundSyncBatch[] = [];
  #cursor = 0;

  async ingest(batch: OutboundSyncBatch): Promise<SyncAck> {
    this.ingested.push(batch);
    this.#cursor += 1;
    return {
      lastAckedRecordId: batch.recordId,
      serverCursor: `cursor_${this.#cursor}`,
    };
  }
}

export type SyncGateResult =
  | { ok: true; ack: SyncAck }
  | { ok: false; reason: "stale_epoch" };

export async function syncOutbound(
  client: OutboundSyncClient,
  expectedFence: RunnerFence,
  batch: OutboundSyncBatch,
): Promise<SyncGateResult> {
  const check = assertRunnerEpoch(expectedFence, batch.fence, "sync-outbound");
  if (!check.ok) return { ok: false, reason: "stale_epoch" };
  const ack = await client.ingest(batch);
  return { ok: true, ack };
}
