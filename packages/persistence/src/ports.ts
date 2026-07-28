import type { RoomEvent } from "@huddle/protocol";
import type {
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

/** Core persistence port shared by SQLite and future Postgres adapters. */
export interface ControlPlaneStore {
  upsertUser(user: UserRecord): void;
  getUser(userId: string): UserRecord | null;

  createSession(session: SessionRecord): void;
  getSession(sessionId: string): SessionRecord | null;
  deleteSession(sessionId: string): void;

  createRoom(input: CreateRoomInput): {
    room: RoomRecord;
    member: MemberRecord;
    lease: DriverLeaseRecord;
    event: RoomEvent;
  };
  getRoom(roomId: string): RoomRecord | null;
  getRoomBySlug(slug: string): RoomRecord | null;

  listMembers(roomId: string, activeOnly?: boolean): MemberRecord[];
  getMember(roomId: string, memberId: string): MemberRecord | null;
  getActiveMemberByUser(roomId: string, userId: string): MemberRecord | null;

  createInvite(input: CreateInviteInput): InviteRecord | { error: "membership_version_mismatch" | "room_not_found" | "not_member" };
  getInviteByToken(token: string): InviteRecord | null;
  revokeInvite(roomId: string, inviteId: string, expectedMembershipVersion: number): boolean;
  joinWithInvite(input: JoinRoomInput):
    | { room: RoomRecord; member: MemberRecord; event: RoomEvent }
    | { error: string };

  getDriverLease(roomId: string): DriverLeaseRecord | null;

  commitMutation(input: CommitMutationInput): CommitMutationResult;
  getMutation(mutationId: string): MutationReceipt | null;

  getEventsAfter(
    roomId: string,
    afterSequence: number,
    opts: {
      limitBytes: number;
      visibility: ReadonlySet<string>;
    },
  ): CatchUpPage;

  getHighWaterMark(roomId: string): number;

  claimOutbox(channel: OutboxChannel, roomId: string, afterId: string | null, limit: number): OutboxRecord[];
  markOutboxDelivered(ids: string[], deliveredAt: string): void;

  createWsTicket(ticket: WsTicketRecord): void;
  consumeWsTicket(ticketId: string, nowIso: string): WsTicketRecord | null;

  /** Compare-and-swap runner epoch; returns new epoch or null on stale. */
  casRunnerEpoch(roomId: string, expectedEpoch: number, nowIso: string): number | null;
}

/** Wake-up hint port (Postgres LISTEN/NOTIFY). SQLite uses in-process emitters. */
export interface OutboxWakePort {
  notify(channel: OutboxChannel, roomId: string): void;
  subscribe(handler: (channel: OutboxChannel, roomId: string) => void): () => void;
}
