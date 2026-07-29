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
  /** Public URL used for OAuth callbacks and invite links. */
  publicBaseUrl: string;
};

export type ControlPlaneConfig = {
  sqlitePath?: string;
  databaseUrl?: string;
  port?: number;
  host?: string;
  publicBaseUrl?: string;
  clock?: Clock;
  ids?: IdGenerator;
};

function resolveDatabaseUrl(config: ControlPlaneConfig): string | undefined {
  return config.databaseUrl ?? process.env.HUDDLE_DATABASE_URL;
}

/** Map sqlite:///path or file paths into a filesystem sqlite path. */
export function resolveSqlitePath(
  config: ControlPlaneConfig,
  databaseUrl?: string,
): string {
  if (config.sqlitePath) return config.sqlitePath;
  if (process.env.HUDDLE_SQLITE_PATH?.trim()) return process.env.HUDDLE_SQLITE_PATH.trim();
  if (databaseUrl?.startsWith("sqlite:///")) {
    return databaseUrl.slice("sqlite://".length);
  }
  if (databaseUrl?.startsWith("sqlite://")) {
    return databaseUrl.slice("sqlite://".length);
  }
  return ":memory:";
}

export function resolvePublicBaseUrl(host: string, port: number, override?: string): string {
  const fromEnv = override ?? process.env.HUDDLE_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const safeHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `http://${safeHost}:${port}`;
}

export function createDeps(config: ControlPlaneConfig = {}): ControlPlaneDeps {
  const wake = new InProcessOutboxWake();
  const databaseUrl = resolveDatabaseUrl(config);
  const store =
    databaseUrl && databaseUrl.startsWith("postgres")
      ? createPostgresStore({ connectionString: databaseUrl, wake })
      : createSqliteStore({
          path: resolveSqlitePath(config, databaseUrl),
          wake,
        });
  const port = config.port ?? Number(process.env.PORT ?? process.env.HUDDLE_PORT ?? 8787);
  const host = config.host ?? process.env.HOST ?? process.env.HUDDLE_HOST ?? "127.0.0.1";
  return {
    store,
    wake,
    clock: config.clock ?? new FakeClock(),
    ids: config.ids ?? new FakeIdGenerator(),
    port,
    host,
    publicBaseUrl: resolvePublicBaseUrl(host, port, config.publicBaseUrl),
  };
}
