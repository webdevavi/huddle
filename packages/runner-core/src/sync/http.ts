import type { RoomEvent } from "@huddle/protocol";
import type { OutboundSyncBatch, OutboundSyncClient, SyncAck } from "./client.js";

export type HttpOutboundSyncClientOptions = {
  baseUrl: string;
  roomId: string;
  /** Session or runner bearer token */
  token: string;
  fetchImpl?: typeof fetch;
};

/**
 * Outbound runner → control-plane event ingest over HTTP.
 */
export class HttpOutboundSyncClient implements OutboundSyncClient {
  readonly #baseUrl: string;
  readonly #roomId: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(options: HttpOutboundSyncClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#roomId = options.roomId;
    this.#token = options.token;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async ingest(batch: OutboundSyncBatch): Promise<SyncAck> {
    const res = await this.#fetch(`${this.#baseUrl}/v1/rooms/${this.#roomId}/runner/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#token}`,
        "x-huddle-session": this.#token,
      },
      body: JSON.stringify({
        roomIncarnation: batch.fence.roomIncarnation,
        runnerEpoch: batch.fence.runnerEpoch,
        recordId: batch.recordId,
        events: batch.events as RoomEvent[],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`runner ingest failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as SyncAck;
    return json;
  }
}
