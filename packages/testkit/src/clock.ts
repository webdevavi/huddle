export interface Clock {
  now(): Date;
  nowIso(): string;
  nowMs(): number;
}

export class FakeClock implements Clock {
  #ms: number;

  constructor(start: Date | string | number = "2026-07-28T00:00:00.000Z") {
    this.#ms = typeof start === "number" ? start : new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.#ms);
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  nowMs(): number {
    return this.#ms;
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error("FakeClock.advance requires a non-negative finite number");
    }
    this.#ms += ms;
  }

  set(next: Date | string | number): void {
    this.#ms = typeof next === "number" ? next : new Date(next).getTime();
  }
}
