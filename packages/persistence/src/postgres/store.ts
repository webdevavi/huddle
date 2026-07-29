import { authorizeMutation } from "@huddle/authz";
import {
  PROTOCOL_SCHEMA_VERSION,
  createRoomEventEnvelope,
  type RoomEvent,
  type Visibility,
} from "@huddle/protocol";
import pg from "pg";
import type { ControlPlaneStore, OutboxWakePort } from "../ports.js";
import type { PostgresStoreConfig } from "./ports.js";
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
  OutboxChannel,
  OutboxRecord,
  RoomRecord,
  SessionRecord,
  UserRecord,
  WsTicketRecord,
} from "../types.js";
import { leaseRecordToAuthz } from "../types.js";
import {
  decodeCursor,
  encodeCursor,
  rowToEvent,
  rowToInvite,
  rowToLease,
  rowToMember,
  rowToRoom,
  type SqlRow,
} from "../sql-mappers.js";
import { loadControlPlaneMigrationSql } from "../sqlite/client.js";
import { createSqliteStore, InProcessOutboxWake, type SqliteStoreOptions } from "../sqlite/store.js";

const { Pool } = pg;
type PoolClient = pg.PoolClient;

/** Convert `?` placeholders to Postgres `$1` style. */
function pgSql(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function withTx<T>(pool: pg.Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

type Q = Pick<PoolClient, "query">;

async function qOne(db: Q, sql: string, params: unknown[] = []): Promise<SqlRow | undefined> {
  const res = await db.query(pgSql(sql), params);
  return (res.rows[0] as SqlRow | undefined) ?? undefined;
}

async function qAll(db: Q, sql: string, params: unknown[] = []): Promise<SqlRow[]> {
  const res = await db.query(pgSql(sql), params);
  return res.rows as SqlRow[];
}

async function qRun(db: Q, sql: string, params: unknown[] = []): Promise<number> {
  const res = await db.query(pgSql(sql), params);
  return res.rowCount ?? 0;
}

/**
 * Postgres-backed ControlPlaneStore using `pg` Pool.
 * Migration SQL is the shared control-plane schema (Postgres-compatible).
 */
export class PostgresStore implements ControlPlaneStore {
  readonly pool: pg.Pool;
  readonly wake: OutboxWakePort;
  readonly #migrated: Promise<void>;

  constructor(config: PostgresStoreConfig, wake?: OutboxWakePort) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      ...(config.statementTimeoutMs === undefined
        ? {}
        : { statement_timeout: config.statementTimeoutMs }),
    });
    this.wake = wake ?? new InProcessOutboxWake();
    this.#migrated = this.#ensureMigrated();
  }

  async #ensureMigrated(): Promise<void> {
    const sql = loadControlPlaneMigrationSql()
      // SQLite partial unique index → Postgres-compatible form already in migration
      .replace(/INTEGER/g, "BIGINT");
    await this.pool.query(sql);
  }

  async #ready(): Promise<void> {
    await this.#migrated;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async upsertUser(user: UserRecord): Promise<void> {
    await this.#ready();
    await qRun(
      this.pool,
      `INSERT INTO users (id, display_name, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`,
      [user.id, user.displayName, user.createdAt],
    );
  }

  async getUser(userId: string): Promise<UserRecord | null> {
    await this.#ready();
    const row = await qOne(this.pool, `SELECT * FROM users WHERE id = ?`, [userId]);
    if (!row) return null;
    return {
      id: String(row.id),
      displayName: String(row.display_name),
      createdAt: String(row.created_at),
    };
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.#ready();
    await qRun(
      this.pool,
      `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
      [session.id, session.userId, session.expiresAt, session.createdAt],
    );
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    await this.#ready();
    const row = await qOne(this.pool, `SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.#ready();
    await qRun(this.pool, `DELETE FROM sessions WHERE id = ?`, [sessionId]);
  }

  async getRoom(roomId: string): Promise<RoomRecord | null> {
    await this.#ready();
    const row = await qOne(this.pool, `SELECT * FROM rooms WHERE id = ?`, [roomId]);
    return row ? rowToRoom(row) : null;
  }

  async getRoomBySlug(slug: string): Promise<RoomRecord | null> {
    await this.#ready();
    const row = await qOne(this.pool, `SELECT * FROM rooms WHERE slug = ?`, [slug]);
    return row ? rowToRoom(row) : null;
  }

  async listMembers(roomId: string, activeOnly = true): Promise<MemberRecord[]> {
    await this.#ready();
    const rows = activeOnly
      ? await qAll(
          this.pool,
          `SELECT * FROM members WHERE room_id = ? AND removed_at IS NULL`,
          [roomId],
        )
      : await qAll(this.pool, `SELECT * FROM members WHERE room_id = ?`, [roomId]);
    return rows.map(rowToMember);
  }

  async getMember(roomId: string, memberId: string): Promise<MemberRecord | null> {
    await this.#ready();
    const row = await qOne(
      this.pool,
      `SELECT * FROM members WHERE room_id = ? AND member_id = ?`,
      [roomId, memberId],
    );
    return row ? rowToMember(row) : null;
  }

  async getActiveMemberByUser(roomId: string, userId: string): Promise<MemberRecord | null> {
    await this.#ready();
    const row = await qOne(
      this.pool,
      `SELECT * FROM members WHERE room_id = ? AND user_id = ? AND removed_at IS NULL`,
      [roomId, userId],
    );
    return row ? rowToMember(row) : null;
  }

  async getDriverLease(roomId: string): Promise<DriverLeaseRecord | null> {
    await this.#ready();
    const row = await qOne(this.pool, `SELECT * FROM driver_leases WHERE room_id = ?`, [roomId]);
    return row ? rowToLease(row) : null;
  }

  async getInviteByToken(token: string): Promise<InviteRecord | null> {
    await this.#ready();
    const row = await qOne(this.pool, `SELECT * FROM invites WHERE token = ?`, [token]);
    return row ? rowToInvite(row) : null;
  }

  async getMutation(mutationId: string): Promise<MutationReceipt | null> {
    await this.#ready();
    const row = await qOne(this.pool, `SELECT * FROM mutations WHERE mutation_id = ?`, [mutationId]);
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

  async getHighWaterMark(roomId: string): Promise<number> {
    const room = await this.getRoom(roomId);
    return room?.lastSequence ?? 0;
  }

  async createRoom(input: CreateRoomInput) {
    await this.#ready();
    const result = await withTx(this.pool, async (client) => {
      await qRun(
        client,
        `INSERT INTO rooms (
           id, slug, name, incarnation, runner_epoch, state, membership_version,
           last_sequence, owner_user_id, created_at, archived_at
         ) VALUES (?, ?, ?, ?, 0, 'waiting_for_runner', 1, 0, ?, ?, NULL)`,
        [input.roomId, input.slug, input.name ?? null, input.incarnation, input.ownerUserId, input.nowIso],
      );
      await qRun(
        client,
        `INSERT INTO members (
           room_id, member_id, user_id, role, display_name, joined_at, removed_at
         ) VALUES (?, ?, ?, 'owner', ?, ?, NULL)`,
        [
          input.roomId,
          input.ownerMemberId,
          input.ownerUserId,
          input.ownerDisplayName ?? null,
          input.nowIso,
        ],
      );
      const leaseExpires = new Date(Date.parse(input.nowIso) + 60 * 60 * 1000).toISOString();
      await qRun(
        client,
        `INSERT INTO driver_leases (
           room_id, state, member_id, lease_version, acquired_at, expires_at, last_activity_at
         ) VALUES (?, 'active', ?, 1, ?, ?, ?)`,
        [input.roomId, input.ownerMemberId, input.nowIso, leaseExpires, input.nowIso],
      );
      const event = await insertEvent(client, input.roomId, input.nowIso, {
        eventId: `evt_room_created_${input.roomId}`,
        type: "room.created",
        payload: {
          slug: input.slug,
          ...(input.name === undefined ? {} : { name: input.name }),
        },
        actor: {
          type: "member",
          id: input.ownerMemberId,
          ...(input.ownerDisplayName === undefined ? {} : { displayName: input.ownerDisplayName }),
        },
        visibility: "room",
      });
      await insertOutbox(client, event);
      const roomRow = await qOne(client, `SELECT * FROM rooms WHERE id = ?`, [input.roomId]);
      const memberRow = await qOne(
        client,
        `SELECT * FROM members WHERE room_id = ? AND member_id = ?`,
        [input.roomId, input.ownerMemberId],
      );
      const leaseRow = await qOne(client, `SELECT * FROM driver_leases WHERE room_id = ?`, [
        input.roomId,
      ]);
      if (!roomRow || !memberRow || !leaseRow) throw new Error("createRoom failed");
      return {
        room: rowToRoom(roomRow),
        member: rowToMember(memberRow),
        lease: rowToLease(leaseRow),
        event,
      };
    });
    this.wake.notify("browser", input.roomId);
    this.wake.notify("runner", input.roomId);
    return result;
  }

  async createInvite(input: CreateInviteInput) {
    await this.#ready();
    const room = await this.getRoom(input.roomId);
    if (!room) return { error: "room_not_found" as const };
    if (room.membershipVersion !== input.expectedMembershipVersion) {
      return { error: "membership_version_mismatch" as const };
    }
    const member = await this.getMember(input.roomId, input.createdByMemberId);
    if (!member || member.removedAt) return { error: "not_member" as const };
    await qRun(
      this.pool,
      `INSERT INTO invites (
         id, room_id, token, role, created_by_member_id, expires_at, consumed_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        input.inviteId,
        input.roomId,
        input.token,
        input.role,
        input.createdByMemberId,
        input.expiresAt,
        input.nowIso,
      ],
    );
    const invite = await this.getInviteByToken(input.token);
    if (!invite) throw new Error("invite insert failed");
    return invite;
  }

  async revokeInvite(
    roomId: string,
    inviteId: string,
    expectedMembershipVersion: number,
  ): Promise<boolean> {
    await this.#ready();
    const room = await this.getRoom(roomId);
    if (!room || room.membershipVersion !== expectedMembershipVersion) return false;
    const changes = await qRun(
      this.pool,
      `UPDATE invites SET consumed_at = COALESCE(consumed_at, ?)
       WHERE room_id = ? AND id = ? AND consumed_at IS NULL`,
      [new Date().toISOString(), roomId, inviteId],
    );
    return changes > 0;
  }

  async joinWithInvite(input: JoinRoomInput) {
    await this.#ready();
    try {
      const result = await withTx(this.pool, async (client) => {
        const inviteRow = await qOne(client, `SELECT * FROM invites WHERE token = ?`, [
          input.inviteToken,
        ]);
        if (!inviteRow) return { error: "invite_invalid" } as const;
        const invite = rowToInvite(inviteRow);
        if (invite.roomId !== input.roomId) return { error: "invite_invalid" } as const;
        if (invite.consumedAt) return { error: "invite_consumed" } as const;
        if (Date.parse(input.nowIso) > Date.parse(invite.expiresAt)) {
          return { error: "invite_expired" } as const;
        }
        const roomRow = await qOne(client, `SELECT * FROM rooms WHERE id = ?`, [input.roomId]);
        if (!roomRow) return { error: "room_not_found" } as const;
        const room = rowToRoom(roomRow);
        if (room.archivedAt) return { error: "room_archived" } as const;
        const existing = await qOne(
          client,
          `SELECT * FROM members WHERE room_id = ? AND user_id = ? AND removed_at IS NULL`,
          [input.roomId, input.userId],
        );
        if (existing) return { error: "already_member" } as const;

        await qRun(client, `UPDATE invites SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`, [
          input.nowIso,
          invite.id,
        ]);
        await qRun(client, `UPDATE rooms SET membership_version = membership_version + 1 WHERE id = ?`, [
          input.roomId,
        ]);
        await qRun(
          client,
          `INSERT INTO members (
             room_id, member_id, user_id, role, display_name, joined_at, removed_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          [
            input.roomId,
            input.memberId,
            input.userId,
            invite.role,
            input.displayName ?? null,
            input.nowIso,
          ],
        );
        const event = await insertEvent(client, input.roomId, input.nowIso, {
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
        await insertOutbox(client, event);
        const updatedRoom = rowToRoom(
          (await qOne(client, `SELECT * FROM rooms WHERE id = ?`, [input.roomId]))!,
        );
        const member = rowToMember(
          (await qOne(
            client,
            `SELECT * FROM members WHERE room_id = ? AND member_id = ?`,
            [input.roomId, input.memberId],
          ))!,
        );
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

  async commitMutation(input: CommitMutationInput): Promise<CommitMutationResult> {
    await this.#ready();
    const existing = await qOne(this.pool, `SELECT * FROM mutations WHERE mutation_id = ?`, [
      input.mutationId,
    ]);
    if (existing) {
      if (String(existing.request_hash) !== input.requestHash) {
        return {
          ok: false,
          code: "idempotency_conflict",
          message: "mutation_id reused with a different request body",
        };
      }
      const eventIds = JSON.parse(String(existing.event_ids_json)) as string[];
      const events: RoomEvent[] = [];
      for (const eventId of eventIds) {
        const row = await qOne(this.pool, `SELECT * FROM room_events WHERE event_id = ?`, [eventId]);
        if (row) events.push(rowToEvent(row));
      }
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

    const committed = await withTx(this.pool, async (client) => {
      const roomRow = await qOne(client, `SELECT * FROM rooms WHERE id = ?`, [input.roomId]);
      if (!roomRow) {
        return { ok: false as const, code: "room_not_found" as const, message: "room not found" };
      }
      const room = rowToRoom(roomRow);
      if (room.archivedAt || room.state === "archived") {
        return { ok: false as const, code: "room_archived" as const, message: "room is archived" };
      }
      if (room.membershipVersion !== input.auth.expectedMembershipVersion) {
        return {
          ok: false as const,
          code: "membership_version_mismatch" as const,
          message: "stale membership version",
        };
      }
      const memberRow = await qOne(
        client,
        `SELECT * FROM members WHERE room_id = ? AND member_id = ?`,
        [input.roomId, input.auth.memberId],
      );
      if (!memberRow || memberRow.removed_at != null) {
        return {
          ok: false as const,
          code: "member_not_found" as const,
          message: "member not found",
        };
      }
      const leaseRow = await qOne(client, `SELECT * FROM driver_leases WHERE room_id = ?`, [
        input.roomId,
      ]);
      const lease = leaseRow ? rowToLease(leaseRow) : null;
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
        await qRun(
          client,
          `UPDATE driver_leases
           SET state = ?, member_id = ?, lease_version = ?, acquired_at = ?,
               expires_at = ?, last_activity_at = ?
           WHERE room_id = ?`,
          [
            input.leaseUpdate.state,
            input.leaseUpdate.memberId,
            input.leaseUpdate.leaseVersion,
            input.leaseUpdate.acquiredAt,
            input.leaseUpdate.expiresAt,
            input.leaseUpdate.lastActivityAt,
            input.roomId,
          ],
        );
      }
      if (input.bumpMembershipVersion) {
        await qRun(
          client,
          `UPDATE rooms SET membership_version = membership_version + 1 WHERE id = ?`,
          [input.roomId],
        );
      }
      if (input.archive) {
        await qRun(client, `UPDATE rooms SET state = 'archived', archived_at = ? WHERE id = ?`, [
          input.nowIso,
          input.roomId,
        ]);
      }
      if (input.approvalUpsert) {
        const a = input.approvalUpsert;
        await qRun(
          client,
          `INSERT INTO approvals (
             room_id, approval_id, category, evidence_digest, request_nonce,
             status, decision, resolver_member_id, created_at, resolved_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(room_id, approval_id) DO UPDATE SET
             status = excluded.status,
             decision = excluded.decision,
             resolver_member_id = excluded.resolver_member_id,
             resolved_at = excluded.resolved_at`,
          [
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
          ],
        );
      }

      const events: RoomEvent[] = [];
      for (const ev of input.events) {
        events.push(await insertEvent(client, input.roomId, input.nowIso, ev));
      }
      for (const event of events) {
        await insertOutbox(client, event);
      }
      const last = events[events.length - 1];
      if (!last) throw new Error("commitMutation requires at least one event");

      const receipt: MutationReceipt = {
        mutationId: input.mutationId,
        roomId: input.roomId,
        status: "durable",
        sequence: last.sequence,
        eventIds: events.map((e) => e.eventId),
        replayed: false,
      };
      await qRun(
        client,
        `INSERT INTO mutations (
           mutation_id, room_id, actor_member_id, status, sequence, event_ids_json,
           request_hash, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receipt.mutationId,
          receipt.roomId,
          input.auth.memberId,
          receipt.status,
          receipt.sequence,
          JSON.stringify(receipt.eventIds),
          input.requestHash,
          input.nowIso,
        ],
      );
      await qRun(client, `UPDATE mutations SET status = 'dispatched' WHERE mutation_id = ?`, [
        receipt.mutationId,
      ]);
      receipt.status = "dispatched";
      return { ok: true as const, receipt, events };
    });

    if (committed.ok) {
      this.wake.notify("browser", input.roomId);
      this.wake.notify("runner", input.roomId);
    }
    return committed;
  }

  async getEventsAfter(
    roomId: string,
    afterSequence: number,
    opts: { limitBytes: number; visibility: ReadonlySet<string> },
  ): Promise<CatchUpPage> {
    await this.#ready();
    const room = await this.getRoom(roomId);
    const highWaterMark = room?.lastSequence ?? 0;
    const rows = await qAll(
      this.pool,
      `SELECT * FROM room_events
       WHERE room_id = ? AND sequence > ?
       ORDER BY sequence ASC`,
      [roomId, afterSequence],
    );
    const events: RoomEvent[] = [];
    let bytes = 0;
    let truncated = false;
    let lastIncluded = afterSequence;
    for (const row of rows) {
      const event = rowToEvent(row);
      if (!opts.visibility.has(event.visibility)) {
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

  async claimOutbox(
    channel: OutboxChannel,
    roomId: string,
    afterId: string | null,
    limit: number,
  ): Promise<OutboxRecord[]> {
    await this.#ready();
    const rows = afterId
      ? await qAll(
          this.pool,
          `SELECT * FROM outbox
           WHERE channel = ? AND room_id = ? AND delivered_at IS NULL AND id > ?
           ORDER BY sequence ASC, id ASC
           LIMIT ?`,
          [channel, roomId, afterId, limit],
        )
      : await qAll(
          this.pool,
          `SELECT * FROM outbox
           WHERE channel = ? AND room_id = ? AND delivered_at IS NULL
           ORDER BY sequence ASC, id ASC
           LIMIT ?`,
          [channel, roomId, limit],
        );
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

  async markOutboxDelivered(ids: string[], deliveredAt: string): Promise<void> {
    await this.#ready();
    await withTx(this.pool, async (client) => {
      for (const id of ids) {
        await qRun(
          client,
          `UPDATE outbox SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL`,
          [deliveredAt, id],
        );
      }
    });
  }

  async createWsTicket(ticket: WsTicketRecord): Promise<void> {
    await this.#ready();
    await qRun(
      this.pool,
      `INSERT INTO ws_tickets (
         id, room_id, subject_type, subject_id, expires_at, consumed_at, created_at
       ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      [
        ticket.id,
        ticket.roomId,
        ticket.subjectType,
        ticket.subjectId,
        ticket.expiresAt,
        ticket.createdAt,
      ],
    );
  }

  async consumeWsTicket(ticketId: string, nowIso: string): Promise<WsTicketRecord | null> {
    await this.#ready();
    return withTx(this.pool, async (client) => {
      const row = await qOne(client, `SELECT * FROM ws_tickets WHERE id = ?`, [ticketId]);
      if (!row) return null;
      if (row.consumed_at != null) return null;
      if (Date.parse(nowIso) > Date.parse(String(row.expires_at))) return null;
      await qRun(client, `UPDATE ws_tickets SET consumed_at = ? WHERE id = ?`, [nowIso, ticketId]);
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

  async casRunnerEpoch(
    roomId: string,
    expectedEpoch: number,
    _nowIso: string,
  ): Promise<number | null> {
    await this.#ready();
    const changes = await qRun(
      this.pool,
      `UPDATE rooms SET runner_epoch = runner_epoch + 1
       WHERE id = ? AND runner_epoch = ?`,
      [roomId, expectedEpoch],
    );
    if (changes === 0) return null;
    const room = await this.getRoom(roomId);
    return room?.runnerEpoch ?? null;
  }

  async ingestRunnerEvents(input: {
    roomId: string;
    roomIncarnation: string;
    runnerEpoch: number;
    recordId: string;
    events: AppendEventInput[];
    nowIso: string;
  }) {
    await this.#ready();
    const room = await this.getRoom(input.roomId);
    if (!room) {
      return { ok: false as const, code: "room_not_found" as const, message: "room not found" };
    }
    if (room.incarnation !== input.roomIncarnation) {
      return {
        ok: false as const,
        code: "incarnation_mismatch" as const,
        message: "room incarnation mismatch",
      };
    }
    if (room.runnerEpoch !== input.runnerEpoch) {
      return {
        ok: false as const,
        code: "epoch_mismatch" as const,
        message: "runner epoch mismatch",
      };
    }
    await withTx(this.pool, async (client) => {
      for (const ev of input.events) {
        const event = await insertEvent(client, input.roomId, input.nowIso, {
          ...ev,
          runnerEpoch: input.runnerEpoch,
        });
        await insertOutbox(client, event);
      }
    });
    if (input.events.length > 0) {
      this.wake.notify("browser", input.roomId);
      this.wake.notify("runner", input.roomId);
    }
    const highWaterMark = await this.getHighWaterMark(input.roomId);
    const serverCursor = encodeCursor({
      v: 1,
      roomId: input.roomId,
      afterSequence: highWaterMark,
      membershipVersion: room.membershipVersion,
      visibility: ["room", "approvers", "owner"],
    });
    return {
      ok: true as const,
      lastAckedRecordId: input.recordId,
      serverCursor,
      highWaterMark,
    };
  }
}

async function insertEvent(
  client: PoolClient,
  roomId: string,
  nowIso: string,
  input: AppendEventInput,
): Promise<RoomEvent> {
  const roomRow = await qOne(client, `SELECT * FROM rooms WHERE id = ?`, [roomId]);
  if (!roomRow) throw new Error("room missing during event insert");
  const room = rowToRoom(roomRow);
  const sequence = room.lastSequence + 1;
  await qRun(client, `UPDATE rooms SET last_sequence = ? WHERE id = ?`, [sequence, roomId]);
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
  await qRun(
    client,
    `INSERT INTO room_events (
       room_id, sequence, event_id, room_incarnation, runner_epoch, timestamp,
       actor_type, actor_id, actor_display_name, provider, type, payload_json,
       causation_id, correlation_id, native_ids_json, visibility, schema_version
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  );
  return event;
}

async function insertOutbox(client: PoolClient, event: RoomEvent): Promise<void> {
  for (const channel of ["browser", "runner"] as const) {
    await qRun(
      client,
      `INSERT INTO outbox (id, channel, room_id, sequence, event_json, created_at, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [
        `${channel}_${event.eventId}`,
        channel,
        event.roomId,
        event.sequence,
        JSON.stringify(event),
        event.timestamp,
      ],
    );
  }
}

export type CreatePostgresStoreOptions = PostgresStoreConfig & {
  wake?: OutboxWakePort;
};

export function createPostgresStore(options: CreatePostgresStoreOptions): ControlPlaneStore {
  if (options.connectionString.startsWith("sqlite:")) {
    const path = options.connectionString.slice("sqlite:".length);
    return createSqliteStore({
      path: path.length > 0 ? path : ":memory:",
      ...(options.wake ? { wake: options.wake } : {}),
    });
  }
  return new PostgresStore(options, options.wake);
}

/**
 * Prove the shared control-plane migration SQL runs (SQLite mirror for local tests).
 */
export function createPostgresStoreFromSqliteMirror(
  options?: SqliteStoreOptions,
): ControlPlaneStore {
  // Loading + applying migration is side-effect of createSqliteStore / createMigratedSqlite.
  loadControlPlaneMigrationSql();
  return createSqliteStore(options);
}

export { decodeCursor, encodeCursor };
