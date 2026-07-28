import type { RoomEvent } from "@huddle/protocol";
import type { ControlPlaneDeps } from "../config.js";

export type HubClient = {
  id: string;
  roomId: string;
  subjectType: "member" | "runner";
  subjectId: string;
  visibility: ReadonlySet<string>;
  /** Last sequence successfully sent on this socket. */
  lastSequence: number;
  send: (payload: unknown) => void;
  close: (code?: number, reason?: string) => void;
};

/**
 * In-process WebSocket fan-out hub.
 * Wake hints trigger per-client authorized sequence reads; outbox remains durable.
 */
export class RoomHub {
  #rooms = new Map<string, Set<HubClient>>();
  #clients = new Map<string, HubClient>();

  constructor(private readonly deps: ControlPlaneDeps) {
    this.deps.wake.subscribe((_channel, roomId) => {
      this.drainRoom(roomId);
    });
  }

  add(client: HubClient): void {
    this.#clients.set(client.id, client);
    let set = this.#rooms.get(client.roomId);
    if (!set) {
      set = new Set();
      this.#rooms.set(client.roomId, set);
    }
    set.add(client);
  }

  remove(clientId: string): void {
    const client = this.#clients.get(clientId);
    if (!client) return;
    this.#clients.delete(clientId);
    const set = this.#rooms.get(client.roomId);
    set?.delete(client);
    if (set && set.size === 0) this.#rooms.delete(client.roomId);
  }

  forceDisconnectMember(roomId: string, memberId: string): void {
    const set = this.#rooms.get(roomId);
    if (!set) return;
    for (const client of [...set]) {
      if (client.subjectType === "member" && client.subjectId === memberId) {
        client.close(4003, "membership_revoked");
        this.remove(client.id);
      }
    }
  }

  drainRoom(roomId: string): void {
    const set = this.#rooms.get(roomId);
    if (!set || set.size === 0) return;

    for (const client of set) {
      const page = this.deps.store.getEventsAfter(roomId, client.lastSequence, {
        limitBytes: 2 * 1024 * 1024,
        visibility: client.visibility,
      });
      for (const event of page.events) {
        client.send({ type: "event", event });
        client.lastSequence = event.sequence;
      }
    }

    // Advance durable outbox cursors after a fan-out attempt (single-node cleanup).
    const browser = this.deps.store.claimOutbox("browser", roomId, null, 200);
    const runner = this.deps.store.claimOutbox("runner", roomId, null, 200);
    const ids = [...browser, ...runner].map((r) => r.id);
    if (ids.length > 0) {
      this.deps.store.markOutboxDelivered(ids, this.deps.clock.nowIso());
    }
  }

  broadcastEvent(roomId: string, event: RoomEvent): void {
    const set = this.#rooms.get(roomId);
    if (!set) return;
    for (const client of set) {
      if (!client.visibility.has(event.visibility)) continue;
      if (event.sequence <= client.lastSequence) continue;
      client.send({ type: "event", event });
      client.lastSequence = event.sequence;
    }
  }
}
