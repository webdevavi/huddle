import type { Clock, IdGenerator } from "@huddle/testkit";
import { randomUUID } from "node:crypto";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowIso(): string {
    return this.now().toISOString();
  }
  nowMs(): number {
    return Date.now();
  }
}

export class UuidGenerator implements IdGenerator {
  eventId(): string {
    return `evt_${randomUUID()}`;
  }
  uuid(): string {
    return randomUUID();
  }
  mutationId(): string {
    return `mut_${randomUUID()}`;
  }
}
