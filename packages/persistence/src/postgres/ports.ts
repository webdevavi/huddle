/**
 * Postgres-oriented ports for a future hosted adapter.
 * This wave ships types only; SQLite is the default runtime.
 */

import type { OutboxWakePort } from "../ports.js";

/** Postgres LISTEN/NOTIFY wake-up (hint only; consumers always cursor-read outbox). */
export type PostgresNotifyWakePort = OutboxWakePort & {
  /** Channel name used with LISTEN/NOTIFY, e.g. huddle_outbox */
  listenChannel: string;
};

/** Marker for a Postgres-backed ControlPlaneStore implementation. */
export type PostgresStoreConfig = {
  connectionString: string;
  /** Statement timeout in ms. */
  statementTimeoutMs?: number;
};

export type PostgresPorts = {
  wake: PostgresNotifyWakePort;
  config: PostgresStoreConfig;
};
