import type { ControlPlaneStore, OutboxWakePort } from "@huddle/persistence";
import type { Clock, IdGenerator } from "@huddle/testkit";
import { FakeClock, FakeIdGenerator } from "@huddle/testkit";
import { createSqliteStore, InProcessOutboxWake } from "@huddle/persistence";

export type ControlPlaneDeps = {
  store: ControlPlaneStore;
  wake: OutboxWakePort;
  clock: Clock;
  ids: IdGenerator;
  port: number;
  host: string;
};

export type ControlPlaneConfig = {
  sqlitePath?: string;
  port?: number;
  host?: string;
  clock?: Clock;
  ids?: IdGenerator;
};

export function createDeps(config: ControlPlaneConfig = {}): ControlPlaneDeps {
  const wake = new InProcessOutboxWake();
  const store = createSqliteStore({
    path: config.sqlitePath ?? ":memory:",
    wake,
  });
  return {
    store,
    wake,
    clock: config.clock ?? new FakeClock(),
    ids: config.ids ?? new FakeIdGenerator(),
    port: config.port ?? 8787,
    host: config.host ?? "127.0.0.1",
  };
}
