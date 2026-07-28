import type { Capability, DriverLease, MembershipRole } from "@huddle/authz";
import type {
  DriverLeaseState,
  EffectStatus,
  RoomEvent,
  RoomState,
  Visibility,
} from "@huddle/protocol";

export type UserRecord = {
  id: string;
  displayName: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type RoomRecord = {
  id: string;
  slug: string;
  name: string | null;
  incarnation: string;
  runnerEpoch: number;
  state: RoomState;
  membershipVersion: number;
  lastSequence: number;
  ownerUserId: string;
  createdAt: string;
  archivedAt: string | null;
};

export type MemberRecord = {
  roomId: string;
  memberId: string;
  userId: string;
  role: MembershipRole;
  displayName: string | null;
  joinedAt: string;
  removedAt: string | null;
};

export type InviteRecord = {
  id: string;
  roomId: string;
  token: string;
  role: MembershipRole;
  createdByMemberId: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type DriverLeaseRecord = {
  roomId: string;
  state: DriverLeaseState;
  memberId: string | null;
  leaseVersion: number;
  acquiredAt: string | null;
  expiresAt: string | null;
  lastActivityAt: string | null;
};

export type MutationReceipt = {
  mutationId: string;
  roomId: string;
  status: EffectStatus;
  sequence: number;
  eventIds: string[];
  replayed: boolean;
};

export type OutboxChannel = "browser" | "runner";

export type OutboxRecord = {
  id: string;
  channel: OutboxChannel;
  roomId: string;
  sequence: number;
  event: RoomEvent;
  createdAt: string;
  deliveredAt: string | null;
};

export type WsTicketRecord = {
  id: string;
  roomId: string;
  subjectType: "member" | "runner";
  subjectId: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type ApprovalRecord = {
  roomId: string;
  approvalId: string;
  category: string;
  evidenceDigest: string;
  requestNonce: string;
  status: "open" | "resolved";
  decision: "allow" | "deny" | "cancel" | null;
  resolverMemberId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type CatchUpPage = {
  events: RoomEvent[];
  nextCursor: string | null;
  highWaterMark: number;
  truncated: boolean;
};

export type OpaqueCursor = {
  v: 1;
  roomId: string;
  afterSequence: number;
  membershipVersion: number;
  visibility: Visibility[];
};

export type CreateRoomInput = {
  roomId: string;
  slug: string;
  name?: string;
  incarnation: string;
  ownerUserId: string;
  ownerMemberId: string;
  ownerDisplayName?: string;
  nowIso: string;
};

export type CreateInviteInput = {
  inviteId: string;
  roomId: string;
  token: string;
  role: MembershipRole;
  createdByMemberId: string;
  expiresAt: string;
  nowIso: string;
  expectedMembershipVersion: number;
};

export type JoinRoomInput = {
  roomId: string;
  inviteToken: string;
  memberId: string;
  userId: string;
  displayName?: string;
  nowIso: string;
  eventId: string;
};

export type MutationAuthContext = {
  memberId: string;
  role: MembershipRole;
  capability: Capability;
  expectedMembershipVersion: number;
  expectedLeaseVersion?: number;
  grantedApprovalCategories?: readonly string[];
};

export type AppendEventInput = {
  type: RoomEvent["type"];
  payload: RoomEvent["payload"];
  actor: RoomEvent["actor"];
  visibility?: Visibility;
  causationId?: string;
  correlationId?: string;
  runnerEpoch?: number;
  provider?: RoomEvent["provider"];
  eventId: string;
};

export type CommitMutationInput = {
  mutationId: string;
  roomId: string;
  auth: MutationAuthContext;
  nowIso: string;
  requestHash: string;
  events: AppendEventInput[];
  /** Optional lease state transition applied atomically with the mutation. */
  leaseUpdate?: {
    state: DriverLeaseState;
    memberId: string | null;
    leaseVersion: number;
    acquiredAt: string | null;
    expiresAt: string | null;
    lastActivityAt: string | null;
  };
  /** Bump room membership_version when membership changes. */
  bumpMembershipVersion?: boolean;
  archive?: boolean;
  approvalUpsert?: ApprovalRecord;
};

export type CommitMutationResult =
  | { ok: true; receipt: MutationReceipt; events: RoomEvent[] }
  | {
      ok: false;
      code:
        | "idempotency_conflict"
        | "room_not_found"
        | "member_not_found"
        | "membership_version_mismatch"
        | "capability_missing"
        | "lease_required"
        | "lease_invalid"
        | "room_archived";
      message: string;
    };

export function leaseRecordToAuthz(lease: DriverLeaseRecord): DriverLease | undefined {
  if (!lease.memberId || !lease.acquiredAt || !lease.expiresAt || !lease.lastActivityAt) {
    return undefined;
  }
  return {
    roomId: lease.roomId,
    memberId: lease.memberId,
    leaseVersion: lease.leaseVersion,
    acquiredAt: lease.acquiredAt,
    expiresAt: lease.expiresAt,
    lastActivityAt: lease.lastActivityAt,
  };
}
