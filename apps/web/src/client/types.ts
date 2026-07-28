import type { RoomEvent } from "@huddle/protocol";
import type { MembershipRole } from "@huddle/authz";
import type { ApprovalState, DriverLeaseState, RoomState, RunState } from "@huddle/protocol";

export type ComposerMode = "comment" | "suggest" | "queue" | "steer";

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline" | "catching_up";

export type SessionIdentity = {
  memberId: string;
  displayName: string;
  role: MembershipRole;
};

export type RoomSnapshot = {
  roomId: string;
  slug: string;
  repoName: string;
  branch: string;
  roomState: RoomState;
  runState: RunState;
  driver: {
    state: DriverLeaseState;
    memberId: string | null;
    displayName: string | null;
    leaseVersion: number;
  };
  policySummary: string;
  retentionUntil: string;
  members: Array<{ memberId: string; displayName: string; role: MembershipRole }>;
  pendingApprovals: Array<{
    approvalId: string;
    category: string;
    evidenceDigest: string;
    state: ApprovalState;
    summary: string;
  }>;
  pendingSuggestions: Array<{
    suggestionId: string;
    text: string;
    authorId: string;
    authorName: string;
  }>;
  events: RoomEvent[];
  lastSequence: number;
};

export type SubmitInputRequest = {
  mode: ComposerMode;
  text: string;
  clientMutationId: string;
};

export type ResolveApprovalRequest = {
  approvalId: string;
  decision: "allow" | "deny" | "cancel";
  evidenceDigest: string;
};

export type ControlPlaneClient = {
  getSession(): Promise<SessionIdentity | null>;
  getRoom(roomId: string): Promise<RoomSnapshot>;
  listEvents(roomId: string, afterSequence: number): Promise<RoomEvent[]>;
  subscribe(
    roomId: string,
    afterSequence: number,
    handlers: {
      onEvent: (event: RoomEvent) => void;
      onConnection: (status: ConnectionStatus) => void;
    },
  ): () => void;
  submitInput(
    roomId: string,
    request: SubmitInputRequest,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  requestDriver(roomId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  handoffDriver(
    roomId: string,
    toMemberId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  reclaimDriver(roomId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  resolveApproval(
    roomId: string,
    request: ResolveApprovalRequest,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  simulateDisconnect?(roomId: string): void;
  simulateReconnect?(roomId: string): void;
};
