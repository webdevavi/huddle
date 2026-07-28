export interface IdGenerator {
  eventId(): string;
  uuid(): string;
  mutationId(): string;
}

export class FakeIdGenerator implements IdGenerator {
  #seq: number;

  constructor(start = 1) {
    this.#seq = start;
  }

  #next(prefix: string): string {
    const value = `${prefix}_${String(this.#seq).padStart(8, "0")}`;
    this.#seq += 1;
    return value;
  }

  eventId(): string {
    return this.#next("evt");
  }

  uuid(): string {
    return this.#next("uuid");
  }

  mutationId(): string {
    return this.#next("mut");
  }

  peek(): number {
    return this.#seq;
  }
}
