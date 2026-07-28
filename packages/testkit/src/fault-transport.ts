export type FaultMode =
  | "pass"
  | "drop"
  | "duplicate"
  | "reorder"
  | "backpressure"
  | "partition"
  | "process_death";

export type FaultTransportOptions = {
  mode?: FaultMode;
  /** When mode is reorder, swap adjacent pairs after this many messages. */
  reorderEvery?: number;
};

/**
 * In-memory fault-injection transport stub (§50).
 * Later lanes can wrap real WS/HTTP with the same mode surface.
 */
export class FaultTransport<T> {
  readonly #queue: T[] = [];
  #mode: FaultMode;
  readonly #reorderEvery: number;
  #seen = 0;
  #dead = false;
  #partitioned = false;
  #backpressured = false;

  constructor(options: FaultTransportOptions = {}) {
    this.#mode = options.mode ?? "pass";
    this.#reorderEvery = options.reorderEvery ?? 2;
  }

  setMode(mode: FaultMode): void {
    this.#mode = mode;
    if (mode === "partition") this.#partitioned = true;
    if (mode === "process_death") this.#dead = true;
    if (mode === "backpressure") this.#backpressured = true;
    if (mode === "pass") {
      this.#partitioned = false;
      this.#dead = false;
      this.#backpressured = false;
    }
  }

  send(message: T): T[] {
    if (this.#dead) {
      throw new Error("FaultTransport: process_death");
    }
    if (this.#partitioned) {
      return [];
    }
    if (this.#backpressured) {
      return [];
    }

    this.#seen += 1;
    switch (this.#mode) {
      case "drop":
        return [];
      case "duplicate":
        this.#queue.push(message, message);
        return [message, message];
      case "reorder": {
        this.#queue.push(message);
        if (this.#queue.length >= this.#reorderEvery) {
          const batch = this.#queue.splice(0, this.#reorderEvery);
          batch.reverse();
          return batch;
        }
        return [];
      }
      case "pass":
      default:
        this.#queue.push(message);
        return [message];
    }
  }

  drain(): T[] {
    return this.#queue.splice(0, this.#queue.length);
  }

  get seen(): number {
    return this.#seen;
  }

  get isDead(): boolean {
    return this.#dead;
  }
}
