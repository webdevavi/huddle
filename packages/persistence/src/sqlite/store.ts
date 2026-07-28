import { authorizeMutation } from "@huddle/authz";
import {
  PROTOCOL_SCHEMA_VERSION,
  createRoomEventEnvelope,
  type RoomEvent,
  type Visibility,
} from "@huddle/protocol";
import type { DatabaseSync } from "node:sqlite";
import type { ControlPlaneStore, OutboxWakePort } from "../ports.js";
import type {
  AppendEventInput,
  CatchUpPage,
  CommitMutationInput,
  CommitMutationResult,
  CreateInviteInput,
  CreateRoomInput,
  DriverLeaseRecord,
  InviteRecord,
  JoinRoomInput,
  MemberRecord,
  MutationReceipt,
  OpaqueCursor,
  OutboxChannel,
  OutboxRecord,
  RoomRecord,
  SessionRecord,
  UserRecord,
  WsTicketRecord,
} from "../types.js";
import { leaseRecordToAuthz } from "../types.js";
import { createMigratedSqlite } from "./client.js";

type SqlRow = Record<string, unknown>;

function runTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors when no transaction is open
    }
    throw err;
  }
}

function encodeCursor(cursor: OpaqueCursor): string {
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

function rowToRoom(row: SqlRow): RoomRecord {
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

function rowToMember(row: SqlRow): MemberRecord {
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

function rowToLease(row: SqlRow): DriverLeaseRecord {
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

function rowToInvite(row: SqlRow): InviteRecord {
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

function rowToEvent(row: SqlRow): RoomEvent {
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

export class InProcessOutboxWake implements OutboxWakePort {
  #handlers = new Set<(channel: OutboxChannel, roomId: string) => void>();

  notify(channel: OutboxChannel, roomId: string): void {
    for (const handler of this.#handlers) {
      handler(channel, roomId);
    }
  }

  subscribe(handler: (channel: OutboxChannel, roomId: string) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }
}

export type SqliteStoreOptions = {
  db?: DatabaseSync;
  path?: string;
  wake?: OutboxWakePort;
};

export class SqliteStore implements ControlPlaneStore {
  readonly db: DatabaseSync;
  readonly wake: OutboxWakePort;

  constructor(options: SqliteStoreOptions = {}) {
    this.db = options.db ?? createMigratedSqlite(options.path ?? ":memory:");
    this.wake = options.wake ?? new InProcessOutboxWake();
  }

  upsertUser(user: UserRecord): void {
    this.db
      .prepare(
        `INSERT INTO users (id, display_name, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`,
      )
      .run(user.id, user.displayName, user.createdAt);
  }

  getUser(userId: string): UserRecord | null {
    const row = this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as SqlRow | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      displayName: String(row.display_name),
      createdAt: String(row.created_at),
    };
  }

  createSession(session: SessionRecord): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(session.id, session.userId, session.expiresAt, session.createdAt);
  }

  getSession(sessionId: string): SessionRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM sessions WHERE id = ?`)
      .get(sessionId) as SqlRow | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
    };
  }

  deleteSession(sessionId: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }

  createRoom(input: CreateRoomInput): {
    room: RoomRecord;
    member: MemberRecord;
    lease: DriverLeaseRecord;
    event: RoomEvent;
  } {
    const run = () => runTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO rooms (
             id, slug, name, incarnation, runner_epoch, state, membership_version,
             last_sequence, owner_user_id, created_at, archived_at
           ) VALUES (?, ?, ?, ?, 0, 'waiting_for_runner', 1, 0, ?, ?, NULL)`,
        )
        .run(
          input.roomId,
          input.slug,
          input.name ?? null,
          input.incarnation,
          input.ownerUserId,
          input.nowIso,
        );

      this.db
        .prepare(
          `INSERT INTO members (
             room_id, member_id, user_id, role, display_name, joined_at, removed_at
           ) VALUES (?, ?, ?, 'owner', ?, ?, NULL)`,
        )
        .run(
          input.roomId,
          input.ownerMemberId,
          input.ownerUserId,
          input.ownerDisplayName ?? null,
          input.nowIso,
        );

      const leaseExpires = new Date(Date.parse(input.nowIso) + 60 * 60 * 1000).toISOString();
      this.db
        .prepare(
          `INSERT INTO driver_leases (
             room_id, state, member_id, lease_version, acquired_at, expires_at, last_activity_at
           ) VALUES (?, 'active', ?, 1, ?, ?, ?)`,
        )
        .run(input.roomId, input.ownerMemberId, input.nowIso, leaseExpires, input.nowIso);

      const event = this.#insertEventUnlocked(input.roomId, input.nowIso, {
        eventId: `evt_room_created_${input.roomId}`,
        type: "room.created",
        payload: {
          slug: input.slug,
          ...(input.name === undefined ? {} : { name: input.name }),
        },
        actor: {
          type: "member",
          id: input.ownerMemberId,
          ...(input.ownerDisplayName === undefined
            ? {}
            : { displayName: input.ownerDisplayName }),
        },
        visibility: "room",
      });

      this.#insertOutboxUnlocked(event);

      const room = this.getRoom(input.roomId);
      const member = this.getMember(input.roomId, input.ownerMemberId);
      const lease = this.getDriverLease(input.roomId);
      if (!room || !member || !lease) {
        throw new Error("createRoom failed to materialize records");
      }
      return { room, member, lease, event };
    });

    const result = run();
    this.wake.notify("browser", input.roomId);
    this.wake.notify("runner", input.roomId);
    return result;
  }

  getRoom(roomId: string): RoomRecord | null {
    const row = this.db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId) as SqlRow | undefined;
    return row ? rowToRoom(row) : null;
  }

  getRoomBySlug(slug: string): RoomRecord | null {
    const row = this.db.prepare(`SELECT * FROM rooms WHERE slug = ?`).get(slug) as SqlRow | undefined;
    return row ? rowToRoom(row) : null;
  }

  listMembers(roomId: string, activeOnly = true): MemberRecord[] {
    const rows = (
      activeOnly
        ? this.db.prepare(`SELECT * FROM members WHERE room_id = ? AND removed_at IS NULL`)
        : this.db.prepare(`SELECT * FROM members WHERE room_id = ?`)
    ).all(roomId) as SqlRow[];
    return rows.map(rowToMember);
  }

  getMember(roomId: string, memberId: string): MemberRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM members WHERE room_id = ? AND member_id = ?`)
      .get(roomId, memberId) as SqlRow | undefined;
    return row ? rowToMember(row) : null;
  }

  getActiveMemberByUser(roomId: string, userId: string): MemberRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM members WHERE room_id = ? AND user_id = ? AND removed_at IS NULL`,
      )
      .get(roomId, userId) as SqlRow | undefined;
    return row ? rowToMember(row) : null;
  }

  createInvite(
    input: CreateInviteInput,
  ): InviteRecord | { error: "membership_version_mismatch" | "room_not_found" | "not_member" } {
    const room = this.getRoom(input.roomId);
    if (!room) return { error: "room_not_found" };
    if (room.membershipVersion !== input.expectedMembershipVersion) {
      return { error: "membership_version_mismatch" };
    }
    const member = this.getMember(input.roomId, input.createdByMemberId);
    if (!member || member.removedAt) return { error: "not_member" };

    this.db
      .prepare(
        `INSERT INTO invites (
           id, room_id, token, role, created_by_member_id, expires_at, consumed_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        input.inviteId,
        input.roomId,
        input.token,
        input.role,
        input.createdByMemberId,
        input.expiresAt,
        input.nowIso,
      );
    const invite = this.getInviteByToken(input.token);
    if (!invite) throw new Error("invite insert failed");
    return invite;
  }

  getInviteByToken(token: string): InviteRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM invites WHERE token = ?`)
      .get(token) as SqlRow | undefined;
    return row ? rowToInvite(row) : null;
  }

  revokeInvite(roomId: string, inviteId: string, expectedMembershipVersion: number): boolean {
    const room = this.getRoom(roomId);
    if (!room || room.membershipVersion !== expectedMembershipVersion) return false;
    const result = this.db
      .prepare(
        `UPDATE invites SET consumed_at = COALESCE(consumed_at, ?)
         WHERE room_id = ? AND id = ? AND consumed_at IS NULL`,
      )
      .run(new Date().toISOString(), roomId, inviteId);
    return Number(result.changes) > 0;
  }

  joinWithInvite(
    input: JoinRoomInput,
  ): { room: RoomRecord; member: MemberRecord; event: RoomEvent } | { error: string } {
    try {
      const result = runTransaction(this.db, () => {
        const invite = this.getInviteByToken(input.inviteToken);
        if (!invite || invite.roomId !== input.roomId) {
          return { error: "invite_invalid" } as const;
        }
        if (invite.consumedAt) return { error: "invite_consumed" } as const;
        if (Date.parse(input.nowIso) > Date.parse(invite.expiresAt)) {
          return { error: "invite_expired" } as const;
        }

        const room = this.getRoom(input.roomId);
        if (!room) return { error: "room_not_found" } as const;
        if (room.archivedAt) return { error: "room_archived" } as const;

        const existing = this.getActiveMemberByUser(input.roomId, input.userId);
        if (existing) {
          return { error: "already_member" } as const;
        }

        this.db
          .prepare(
            `UPDATE invites SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
          )
          .run(input.nowIso, invite.id);

        this.db
          .prepare(
            `UPDATE rooms SET membership_version = membership_version + 1 WHERE id = ?`,
          )
          .run(input.roomId);

        this.db
          .prepare(
            `INSERT INTO members (
               room_id, member_id, user_id, role, display_name, joined_at, removed_at
             ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          )
          .run(
            input.roomId,
            input.memberId,
            input.userId,
            invite.role,
            input.displayName ?? null,
            input.nowIso,
          );

        const event = this.#insertEventUnlocked(input.roomId, input.nowIso, {
          eventId: input.eventId,
          type: "member.joined",
          payload: {
            memberId: input.memberId,
            role: invite.role,
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          },
          actor: {
            type: "member",
            id: input.memberId,
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          },
          visibility: "room",
        });
        this.#insertOutboxUnlocked(event);

        const updatedRoom = this.getRoom(input.roomId);
        const member = this.getMember(input.roomId, input.memberId);
        if (!updatedRoom || !member) throw new Error("join failed");
        return { room: updatedRoom, member, event } as const;
      });

      if ("error" in result) return result;
      this.wake.notify("browser", input.roomId);
      this.wake.notify("runner", input.roomId);
      return result;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "join_failed" };
    }
  }

  getDriverLease(roomId: string): DriverLeaseRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM driver_leases WHERE room_id = ?`)
      .get(roomId) as SqlRow | undefined;
    return row ? rowToLease(row) : null;
  }

  getMutation(mutationId: string): MutationReceipt | null {
    const row = this.db
      .prepare(`SELECT * FROM mutations WHERE mutation_id = ?`)
      .get(mutationId) as SqlRow | undefined;
    if (!row) return null;
    return {
      mutationId: String(row.mutation_id),
      roomId: String(row.room_id),
      status: row.status as MutationReceipt["status"],
      sequence: Number(row.sequence),
      eventIds: JSON.parse(String(row.event_ids_json)) as string[],
      replayed: false,
    };
  }

  commitMutation(input: CommitMutationInput): CommitMutationResult {
    const existing = this.db
      .prepare(`SELECT * FROM mutations WHERE mutation_id = ?`)
      .get(input.mutationId) as SqlRow | undefined;
    if (existing) {
      if (String(existing.request_hash) !== input.requestHash) {
        return {
          ok: false,
          code: "idempotency_conflict",
          message: "mutation_id reused with a different request body",
        };
      }
      const eventIds = JSON.parse(String(existing.event_ids_json)) as string[];
      const events = eventIds
        .map((eventId) => {
          const row = this.db
            .prepare(`SELECT * FROM room_events WHERE event_id = ?`)
            .get(eventId) as SqlRow | undefined;
          return row ? rowToEvent(row) : null;
        })
        .filter((e): e is RoomEvent => e !== null);
      return {
        ok: true,
        receipt: {
          mutationId: String(existing.mutation_id),
          roomId: String(existing.room_id),
          status: existing.status as MutationReceipt["status"],
          sequence: Number(existing.sequence),
          eventIds,
          replayed: true,
        },
        events,
      };
    }

    const committed = runTransaction(this.db, () => {
        const room = this.getRoom(input.roomId);
        if (!room) {
          return {
            ok: false as const,
            code: "room_not_found" as const,
            message: "room not found",
          };
        }
        if (room.archivedAt || room.state === "archived") {
          return {
            ok: false as const,
            code: "room_archived" as const,
            message: "room is archived",
          };
        }
        if (room.membershipVersion !== input.auth.expectedMembershipVersion) {
          return {
            ok: false as const,
            code: "membership_version_mismatch" as const,
            message: "stale membership version",
          };
        }

        const member = this.getMember(input.roomId, input.auth.memberId);
        if (!member || member.removedAt) {
          return {
            ok: false as const,
            code: "member_not_found" as const,
            message: "member not found",
          };
        }

        const lease = this.getDriverLease(input.roomId);
        const authzLease = lease ? leaseRecordToAuthz(lease) : undefined;
        const authz = authorizeMutation({
          role: input.auth.role,
          capability: input.auth.capability,
          memberId: input.auth.memberId,
          nowIso: input.nowIso,
          ...(authzLease ? { lease: authzLease } : {}),
          ...(input.auth.expectedLeaseVersion === undefined
            ? {}
            : { expectedLeaseVersion: input.auth.expectedLeaseVersion }),
          ...(input.auth.grantedApprovalCategories
            ? { grantedApprovalCategories: input.auth.grantedApprovalCategories }
            : {}),
        });

        if (!authz.ok) {
          return {
            ok: false as const,
            code: authz.reason,
            message: `authorization failed: ${authz.reason}`,
          };
        }

        if (input.leaseUpdate) {
          this.db
            .prepare(
              `UPDATE driver_leases
               SET state = ?, member_id = ?, lease_version = ?, acquired_at = ?,
                   expires_at = ?, last_activity_at = ?
               WHERE room_id = ?`,
            )
            .run(
              input.leaseUpdate.state,
              input.leaseUpdate.memberId,
              input.leaseUpdate.leaseVersion,
              input.leaseUpdate.acquiredAt,
              input.leaseUpdate.expiresAt,
              input.leaseUpdate.lastActivityAt,
              input.roomId,
            );
        }

        if (input.bumpMembershipVersion) {
          this.db
            .prepare(
              `UPDATE rooms SET membership_version = membership_version + 1 WHERE id = ?`,
            )
            .run(input.roomId);
        }

        if (input.archive) {
          this.db
            .prepare(
              `UPDATE rooms SET state = 'archived', archived_at = ? WHERE id = ?`,
            )
            .run(input.nowIso, input.roomId);
        }

        if (input.approvalUpsert) {
          const a = input.approvalUpsert;
          this.db
            .prepare(
              `INSERT INTO approvals (
                 room_id, approval_id, category, evidence_digest, request_nonce,
                 status, decision, resolver_member_id, created_at, resolved_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(room_id, approval_id) DO UPDATE SET
                 status = excluded.status,
                 decision = excluded.decision,
                 resolver_member_id = excluded.resolver_member_id,
                 resolved_at = excluded.resolved_at`,
            )
            .run(
              a.roomId,
              a.approvalId,
              a.category,
              a.evidenceDigest,
              a.requestNonce,
              a.status,
              a.decision,
              a.resolverMemberId,
              a.createdAt,
              a.resolvedAt,
            );
        }

        const events: RoomEvent[] = [];
        for (const ev of input.events) {
          events.push(this.#insertEventUnlocked(input.roomId, input.nowIso, ev));
        }
        for (const event of events) {
          this.#insertOutboxUnlocked(event);
        }

        const last = events[events.length - 1];
        if (!last) {
          throw new Error("commitMutation requires at least one event");
        }

        const receipt: MutationReceipt = {
          mutationId: input.mutationId,
          roomId: input.roomId,
          status: "durable",
          sequence: last.sequence,
          eventIds: events.map((e) => e.eventId),
          replayed: false,
        };

        this.db
          .prepare(
            `INSERT INTO mutations (
               mutation_id, room_id, actor_member_id, status, sequence, event_ids_json,
               request_hash, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            receipt.mutationId,
            receipt.roomId,
            input.auth.memberId,
            receipt.status,
            receipt.sequence,
            JSON.stringify(receipt.eventIds),
            input.requestHash,
            input.nowIso,
          );

        // Effect lifecycle: durable -> dispatched via outbox presence.
        this.db
          .prepare(`UPDATE mutations SET status = 'dispatched' WHERE mutation_id = ?`)
          .run(receipt.mutationId);
        receipt.status = "dispatched";

        return { ok: true as const, receipt, events };
      });

    if (committed.ok) {
      this.wake.notify("browser", input.roomId);
      this.wake.notify("runner", input.roomId);
    }
    return committed;
  }

  getHighWaterMark(roomId: string): number {
    const room = this.getRoom(roomId);
    return room?.lastSequence ?? 0;
  }

  getEventsAfter(
    roomId: string,
    afterSequence: number,
    opts: { limitBytes: number; visibility: ReadonlySet<string> },
  ): CatchUpPage {
    const room = this.getRoom(roomId);
    const highWaterMark = room?.lastSequence ?? 0;
    const rows = this.db
      .prepare(
        `SELECT * FROM room_events
         WHERE room_id = ? AND sequence > ?
         ORDER BY sequence ASC`,
      )
      .all(roomId, afterSequence) as SqlRow[];

    const events: RoomEvent[] = [];
    let bytes = 0;
    let truncated = false;
    let lastIncluded = afterSequence;

    for (const row of rows) {
      const event = rowToEvent(row);
      if (!opts.visibility.has(event.visibility)) {
        // Skip unauthorized visibility; opaque cursor still advances past it.
        lastIncluded = event.sequence;
        continue;
      }
      const size = Buffer.byteLength(JSON.stringify(event), "utf8");
      if (events.length > 0 && bytes + size > opts.limitBytes) {
        truncated = true;
        break;
      }
      events.push(event);
      bytes += size;
      lastIncluded = event.sequence;
      if (bytes >= opts.limitBytes) {
        truncated = lastIncluded < highWaterMark;
        break;
      }
    }

    const visibility = [...opts.visibility] as Visibility[];
    const nextCursor =
      lastIncluded < highWaterMark
        ? encodeCursor({
            v: 1,
            roomId,
            afterSequence: lastIncluded,
            membershipVersion: room?.membershipVersion ?? 0,
            visibility,
          })
        : null;

    return { events, nextCursor, highWaterMark, truncated };
  }

  claimOutbox(
    channel: OutboxChannel,
    roomId: string,
    afterId: string | null,
    limit: number,
  ): OutboxRecord[] {
    const rows = (
      afterId
        ? this.db.prepare(
            `SELECT * FROM outbox
             WHERE channel = ? AND room_id = ? AND delivered_at IS NULL AND id > ?
             ORDER BY sequence ASC, id ASC
             LIMIT ?`,
          )
        : this.db.prepare(
            `SELECT * FROM outbox
             WHERE channel = ? AND room_id = ? AND delivered_at IS NULL
             ORDER BY sequence ASC, id ASC
             LIMIT ?`,
          )
    ).all(
      ...(afterId ? [channel, roomId, afterId, limit] : [channel, roomId, limit]),
    ) as SqlRow[];

    return rows.map((row) => ({
      id: String(row.id),
      channel: row.channel as OutboxChannel,
      roomId: String(row.room_id),
      sequence: Number(row.sequence),
      event: JSON.parse(String(row.event_json)) as RoomEvent,
      createdAt: String(row.created_at),
      deliveredAt: row.delivered_at == null ? null : String(row.delivered_at),
    }));
  }

  markOutboxDelivered(ids: string[], deliveredAt: string): void {
    const stmt = this.db.prepare(
      `UPDATE outbox SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL`,
    );
    runTransaction(this.db, () => {
      for (const id of ids) {
        stmt.run(deliveredAt, id);
      }
    });
  }

  createWsTicket(ticket: WsTicketRecord): void {
    this.db
      .prepare(
        `INSERT INTO ws_tickets (
           id, room_id, subject_type, subject_id, expires_at, consumed_at, created_at
         ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        ticket.id,
        ticket.roomId,
        ticket.subjectType,
        ticket.subjectId,
        ticket.expiresAt,
        ticket.createdAt,
      );
  }

  consumeWsTicket(ticketId: string, nowIso: string): WsTicketRecord | null {
    return runTransaction(this.db, () => {
      const row = this.db
        .prepare(`SELECT * FROM ws_tickets WHERE id = ?`)
        .get(ticketId) as SqlRow | undefined;
      if (!row) return null;
      if (row.consumed_at != null) return null;
      if (Date.parse(nowIso) > Date.parse(String(row.expires_at))) return null;
      this.db
        .prepare(`UPDATE ws_tickets SET consumed_at = ? WHERE id = ?`)
        .run(nowIso, ticketId);
      return {
        id: String(row.id),
        roomId: String(row.room_id),
        subjectType: row.subject_type as WsTicketRecord["subjectType"],
        subjectId: String(row.subject_id),
        expiresAt: String(row.expires_at),
        consumedAt: nowIso,
        createdAt: String(row.created_at),
      };
    });
  }

  casRunnerEpoch(roomId: string, expectedEpoch: number, _nowIso: string): number | null {
    const result = this.db
      .prepare(
        `UPDATE rooms SET runner_epoch = runner_epoch + 1
         WHERE id = ? AND runner_epoch = ?`,
      )
      .run(roomId, expectedEpoch);
    if (Number(result.changes) === 0) return null;
    const room = this.getRoom(roomId);
    return room?.runnerEpoch ?? null;
  }

  #insertEventUnlocked(roomId: string, nowIso: string, input: AppendEventInput): RoomEvent {
    const room = this.getRoom(roomId);
    if (!room) throw new Error("room missing during event insert");
    const sequence = room.lastSequence + 1;
    this.db
      .prepare(`UPDATE rooms SET last_sequence = ? WHERE id = ?`)
      .run(sequence, roomId);

    const event = createRoomEventEnvelope({
      schemaVersion: PROTOCOL_SCHEMA_VERSION,
      eventId: input.eventId,
      roomId,
      roomIncarnation: room.incarnation,
      sequence,
      timestamp: nowIso,
      actor: input.actor,
      type: input.type,
      payload: input.payload,
      visibility: input.visibility ?? "room",
      ...(input.runnerEpoch === undefined ? {} : { runnerEpoch: input.runnerEpoch }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    });

    this.db
      .prepare(
        `INSERT INTO room_events (
           room_id, sequence, event_id, room_incarnation, runner_epoch, timestamp,
           actor_type, actor_id, actor_display_name, provider, type, payload_json,
           causation_id, correlation_id, native_ids_json, visibility, schema_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.roomId,
        event.sequence,
        event.eventId,
        event.roomIncarnation,
        event.runnerEpoch ?? null,
        event.timestamp,
        event.actor.type,
        event.actor.id,
        event.actor.displayName ?? null,
        event.provider ?? null,
        event.type,
        JSON.stringify(event.payload),
        event.causationId ?? null,
        event.correlationId ?? null,
        event.nativeIds ? JSON.stringify(event.nativeIds) : null,
        event.visibility,
        event.schemaVersion,
      );

    return event;
  }

  #insertOutboxUnlocked(event: RoomEvent): void {
    for (const channel of ["browser", "runner"] as const) {
      this.db
        .prepare(
          `INSERT INTO outbox (id, channel, room_id, sequence, event_json, created_at, delivered_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          `${channel}_${event.eventId}`,
          channel,
          event.roomId,
          event.sequence,
          JSON.stringify(event),
          event.timestamp,
        );
    }
  }
}

export function createSqliteStore(options?: SqliteStoreOptions): SqliteStore {
  return new SqliteStore(options);
}
