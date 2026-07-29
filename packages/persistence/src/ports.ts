import type { RoomEvent } from "@huddle/protocol";
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
} from "./types.js";

/** Core persistence port shared by SQLite and Postgres adapters (async). */
export interface ControlPlaneStore {
  upsertUser(user: UserRecord): Promise<void>;
  getUser(userId: string): Promise<UserRecord | null>;

  createSession(session: SessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  deleteSession(sessionId: string): Promise<void>;

  createRoom(input: CreateRoomInput): Promise<{
    room: RoomRecord;
    member: MemberRecord;
    lease: DriverLeaseRecord;
    event: RoomEvent;
  }>;
  getRoom(roomId: string): Promise<RoomRecord | null>;
  getRoomBySlug(slug: string): Promise<RoomRecord | null>;

  listMembers(roomId: string, activeOnly?: boolean): Promise<MemberRecord[]>;
  getMember(roomId: string, memberId: string): Promise<MemberRecord | null>;
  getActiveMemberByUser(roomId: string, userId: string): Promise<MemberRecord | null>;

  createInvite(
    input: CreateInviteInput,
  ): Promise<InviteRecord | { error: "membership_version_mismatch" | "room_not_found" | "not_member" }>;
  getInviteByToken(token: string): Promise<InviteRecord | null>;
  revokeInvite(roomId: string, inviteId: string, expectedMembershipVersion: number): Promise<boolean>;
  joinWithInvite(input: JoinRoomInput): Promise<
    | { room: RoomRecord; member: MemberRecord; event: RoomEvent }
    | { error: string }
  >;

  getDriverLease(roomId: string): Promise<DriverLeaseRecord | null>;

  commitMutation(input: CommitMutationInput): Promise<CommitMutationResult>;
  getMutation(mutationId: string): Promise<MutationReceipt | null>;

  getEventsAfter(
    roomId: string,
    afterSequence: number,
    opts: {
      limitBytes: number;
      visibility: ReadonlySet<string>;
    },
  ): Promise<CatchUpPage>;

  getHighWaterMark(roomId: string): Promise<number>;

  claimOutbox(
    channel: OutboxChannel,
    roomId: string,
    afterId: string | null,
    limit: number,
  ): Promise<OutboxRecord[]>;
  markOutboxDelivered(ids: string[], deliveredAt: string): Promise<void>;

  createWsTicket(ticket: WsTicketRecord): Promise<void>;
  consumeWsTicket(ticketId: string, nowIso: string): Promise<WsTicketRecord | null>;

  /** Compare-and-swap runner epoch; returns new epoch or null on stale. */
  casRunnerEpoch(roomId: string, expectedEpoch: number, nowIso: string): Promise<number | null>;

  /**
   * Append runner-ingested events after incarnation/epoch checks.
   * Server assigns sequences; client event sequences are ignored.
   */
  ingestRunnerEvents(input: {
    roomId: string;
    roomIncarnation: string;
    runnerEpoch: number;
    recordId: string;
    events: AppendEventInput[];
    nowIso: string;
  }): Promise<
    | { ok: true; lastAckedRecordId: string; serverCursor: string; highWaterMark: number }
    | {
        ok: false;
        code: "room_not_found" | "incarnation_mismatch" | "epoch_mismatch";
        message: string;
      }
  >;
}

/** Wake-up hint port (Postgres LISTEN/NOTIFY). SQLite uses in-process emitters. */
export interface OutboxWakePort {
  notify(channel: OutboxChannel, roomId: string): void;
  subscribe(handler: (channel: OutboxChannel, roomId: string) => void): () => void;
}
