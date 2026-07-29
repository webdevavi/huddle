import {
  PROTOCOL_SCHEMA_VERSION,
  createRoomEventEnvelope,
  type RoomEvent,
  type Visibility,
} from "@huddle/protocol";
import type {
  DriverLeaseRecord,
  InviteRecord,
  MemberRecord,
  OpaqueCursor,
  RoomRecord,
} from "./types.js";

export type SqlRow = Record<string, unknown>;

export function encodeCursor(cursor: OpaqueCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): OpaqueCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OpaqueCursor;
    if (parsed.v !== 1 || typeof parsed.roomId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function rowToRoom(row: SqlRow): RoomRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: row.name == null ? null : String(row.name),
    incarnation: String(row.incarnation),
    runnerEpoch: Number(row.runner_epoch),
    state: row.state as RoomRecord["state"],
    membershipVersion: Number(row.membership_version),
    lastSequence: Number(row.last_sequence),
    ownerUserId: String(row.owner_user_id),
    createdAt: String(row.created_at),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
  };
}

export function rowToMember(row: SqlRow): MemberRecord {
  return {
    roomId: String(row.room_id),
    memberId: String(row.member_id),
    userId: String(row.user_id),
    role: row.role as MemberRecord["role"],
    displayName: row.display_name == null ? null : String(row.display_name),
    joinedAt: String(row.joined_at),
    removedAt: row.removed_at == null ? null : String(row.removed_at),
  };
}

export function rowToLease(row: SqlRow): DriverLeaseRecord {
  return {
    roomId: String(row.room_id),
    state: row.state as DriverLeaseRecord["state"],
    memberId: row.member_id == null ? null : String(row.member_id),
    leaseVersion: Number(row.lease_version),
    acquiredAt: row.acquired_at == null ? null : String(row.acquired_at),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    lastActivityAt: row.last_activity_at == null ? null : String(row.last_activity_at),
  };
}

export function rowToInvite(row: SqlRow): InviteRecord {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    token: String(row.token),
    role: row.role as InviteRecord["role"],
    createdByMemberId: String(row.created_by_member_id),
    expiresAt: String(row.expires_at),
    consumedAt: row.consumed_at == null ? null : String(row.consumed_at),
    createdAt: String(row.created_at),
  };
}

export function rowToEvent(row: SqlRow): RoomEvent {
  const partial: Parameters<typeof createRoomEventEnvelope>[0] = {
    schemaVersion: Number(row.schema_version),
    eventId: String(row.event_id),
    roomId: String(row.room_id),
    roomIncarnation: String(row.room_incarnation),
    sequence: Number(row.sequence),
    timestamp: String(row.timestamp),
    actor: {
      type: row.actor_type as RoomEvent["actor"]["type"],
      id: String(row.actor_id),
      ...(row.actor_display_name == null
        ? {}
        : { displayName: String(row.actor_display_name) }),
    },
    type: row.type as RoomEvent["type"],
    payload: JSON.parse(String(row.payload_json)) as RoomEvent["payload"],
    visibility: row.visibility as Visibility,
  };
  if (row.runner_epoch != null) partial.runnerEpoch = Number(row.runner_epoch);
  if (row.provider != null) partial.provider = row.provider as NonNullable<RoomEvent["provider"]>;
  if (row.causation_id != null) partial.causationId = String(row.causation_id);
  if (row.correlation_id != null) partial.correlationId = String(row.correlation_id);
  if (row.native_ids_json != null) {
    partial.nativeIds = JSON.parse(String(row.native_ids_json)) as Record<string, string>;
  }
  return createRoomEventEnvelope(partial);
}

export { PROTOCOL_SCHEMA_VERSION, createRoomEventEnvelope };
