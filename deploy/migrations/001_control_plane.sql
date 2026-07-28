-- Huddle control-plane schema (SQLite subset; Postgres-compatible types noted in comments).
-- Apply with packages/persistence SQLite bootstrap or hosted migrator.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT,
  incarnation TEXT NOT NULL,
  runner_epoch INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  membership_version INTEGER NOT NULL DEFAULT 1,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS members (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  member_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  display_name TEXT,
  joined_at TEXT NOT NULL,
  removed_at TEXT,
  PRIMARY KEY (room_id, member_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS members_room_user_active_idx
  ON members(room_id, user_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_by_member_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS invites_room_id_idx ON invites(room_id);

CREATE TABLE IF NOT EXISTS driver_leases (
  room_id TEXT PRIMARY KEY NOT NULL REFERENCES rooms(id),
  state TEXT NOT NULL,
  member_id TEXT,
  lease_version INTEGER NOT NULL DEFAULT 0,
  acquired_at TEXT,
  expires_at TEXT,
  last_activity_at TEXT
);

CREATE TABLE IF NOT EXISTS room_events (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  room_incarnation TEXT NOT NULL,
  runner_epoch INTEGER,
  timestamp TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_display_name TEXT,
  provider TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  causation_id TEXT,
  correlation_id TEXT,
  native_ids_json TEXT,
  visibility TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (room_id, sequence)
);

CREATE INDEX IF NOT EXISTS room_events_room_seq_idx ON room_events(room_id, sequence);

CREATE TABLE IF NOT EXISTS mutations (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  actor_member_id TEXT NOT NULL,
  status TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_ids_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY NOT NULL,
  channel TEXT NOT NULL, -- browser | runner
  room_id TEXT NOT NULL REFERENCES rooms(id),
  sequence INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS outbox_channel_cursor_idx
  ON outbox(channel, room_id, sequence) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS ws_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  subject_type TEXT NOT NULL, -- member | runner
  subject_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  approval_id TEXT NOT NULL,
  category TEXT NOT NULL,
  evidence_digest TEXT NOT NULL,
  request_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  decision TEXT,
  resolver_member_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  PRIMARY KEY (room_id, approval_id)
);
