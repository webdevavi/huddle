import type { ControlPlaneStore, OutboxWakePort } from "@huddle/persistence";
import type { Clock, IdGenerator } from "@huddle/testkit";
import { FakeClock, FakeIdGenerator } from "@huddle/testkit";
import {
  createPostgresStore,
  createSqliteStore,
  InProcessOutboxWake,
} from "@huddle/persistence";

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
  databaseUrl?: string;
  port?: number;
  host?: string;
  clock?: Clock;
  ids?: IdGenerator;
};

function resolveDatabaseUrl(config: ControlPlaneConfig): string | undefined {
  return config.databaseUrl ?? process.env.HUDDLE_DATABASE_URL;
}

export function createDeps(config: ControlPlaneConfig = {}): ControlPlaneDeps {
  const wake = new InProcessOutboxWake();
  const databaseUrl = resolveDatabaseUrl(config);
  const store =
    databaseUrl && databaseUrl.startsWith("postgres")
      ? createPostgresStore({ connectionString: databaseUrl, wake })
      : createSqliteStore({
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
