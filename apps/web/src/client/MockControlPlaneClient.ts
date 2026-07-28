import {
  createRoomEventEnvelope,
  type RoomEvent,
  type RoomState,
  type RunState,
} from "@huddle/protocol";
import type {
  ConnectionStatus,
  ControlPlaneClient,
  ResolveApprovalRequest,
  RoomSnapshot,
  SessionIdentity,
  SubmitInputRequest,
} from "./types.js";

type Listener = {
  onEvent: (event: RoomEvent) => void;
  onConnection: (status: ConnectionStatus) => void;
};

function isoNow(): string {
  return new Date().toISOString();
}

function makeEvent<K extends RoomEvent["type"]>(
  partial: Omit<
    RoomEvent<K>,
    "schemaVersion" | "eventId" | "roomIncarnation" | "timestamp" | "visibility"
  > & {
    eventId?: string;
    roomIncarnation?: string;
    timestamp?: string;
    visibility?: RoomEvent["visibility"];
  },
): RoomEvent<K> {
  return createRoomEventEnvelope({
    eventId: partial.eventId ?? `evt_${partial.sequence}`,
    roomIncarnation: partial.roomIncarnation ?? "inc_1",
    timestamp: partial.timestamp ?? isoNow(),
    visibility: partial.visibility ?? "room",
    ...partial,
  });
}

export type MockSeed =
  "active" | "empty" | "loading" | "error" | "degraded" | "approval" | "reconnect";

export class MockControlPlaneClient implements ControlPlaneClient {
  private session: SessionIdentity | null;
  private rooms = new Map<string, RoomSnapshot>();
  private listeners = new Map<string, Set<Listener>>();
  private connection = new Map<string, ConnectionStatus>();
  private failNext = false;

  constructor(session?: SessionIdentity | null) {
    this.session = session ?? {
      memberId: "member_bob",
      displayName: "Bob",
      role: "collaborator",
    };
    this.seedRoom("room_demo", "active");
  }

  seedRoom(roomId: string, seed: MockSeed): void {
    const baseMembers = [
      { memberId: "member_alice", displayName: "Alice", role: "owner" as const },
      { memberId: "member_bob", displayName: "Bob", role: "collaborator" as const },
    ];

    const roomState: RoomState =
      seed === "degraded" || seed === "reconnect"
        ? "reconnecting"
        : seed === "empty"
          ? "waiting_for_runner"
          : seed === "error"
            ? "failed"
            : "active";

    const runState: RunState =
      seed === "approval"
        ? "awaiting_approval"
        : seed === "empty"
          ? "idle"
          : seed === "error"
            ? "failed"
            : "running";

    const events: RoomEvent[] =
      seed === "empty" || seed === "loading"
        ? []
        : [
            makeEvent({
              roomId,
              sequence: 1,
              actor: { type: "system", id: "system" },
              type: "room.created",
              payload: { slug: "diagnose-flaky-test", name: "Diagnose flaky test" },
            }),
            makeEvent({
              roomId,
              sequence: 2,
              actor: { type: "member", id: "member_alice", displayName: "Alice" },
              type: "member.joined",
              payload: { memberId: "member_alice", role: "owner", displayName: "Alice" },
            }),
            makeEvent({
              roomId,
              sequence: 3,
              actor: { type: "member", id: "member_bob", displayName: "Bob" },
              type: "member.joined",
              payload: { memberId: "member_bob", role: "collaborator", displayName: "Bob" },
            }),
            makeEvent({
              roomId,
              sequence: 4,
              actor: { type: "system", id: "system" },
              type: "driver.changed",
              payload: { memberId: "member_alice", leaseVersion: 1 },
            }),
            makeEvent({
              roomId,
              sequence: 5,
              actor: { type: "member", id: "member_alice", displayName: "Alice" },
              type: "input.queued",
              payload: {
                inputId: "in_1",
                text: "Diagnose the failing timezone conversion test.",
              },
            }),
            makeEvent({
              roomId,
              sequence: 6,
              actor: { type: "agent", id: "agent", displayName: "Codex" },
              type: "agent.plan_updated",
              payload: {
                planId: "plan_1",
                summary: "Reproduce failure, inspect date helpers, propose minimal fix.",
              },
            }),
            makeEvent({
              roomId,
              sequence: 7,
              actor: { type: "agent", id: "agent", displayName: "Codex" },
              type: "agent.command_started",
              payload: { commandId: "cmd_1", command: "pnpm test timezone" },
            }),
            makeEvent({
              roomId,
              sequence: 8,
              actor: { type: "agent", id: "agent", displayName: "Codex" },
              type: "agent.command_completed",
              payload: { commandId: "cmd_1", exitCode: 1 },
            }),
            makeEvent({
              roomId,
              sequence: 9,
              actor: { type: "agent", id: "agent", displayName: "Codex" },
              type: "agent.diff_updated",
              payload: { diffId: "diff_1", summary: "2 files · +18 / −4" },
            }),
            makeEvent({
              roomId,
              sequence: 10,
              actor: { type: "member", id: "member_bob", displayName: "Bob" },
              type: "input.suggested",
              payload: {
                suggestionId: "sug_1",
                text: "Edge case may be DST transition in America/Los_Angeles.",
              },
            }),
          ];

    if (seed === "approval") {
      events.push(
        makeEvent({
          roomId,
          sequence: 11,
          actor: { type: "runner", id: "runner" },
          type: "approval.requested",
          payload: {
            approvalId: "apr_1",
            category: "network",
            evidenceDigest: "sha256:evidence_demo",
            requestNonce: "nonce_1",
          },
        }),
      );
    }

    this.rooms.set(roomId, {
      roomId,
      slug: "diagnose-flaky-test",
      repoName: "acme/payments",
      branch: "huddle/diagnose-flaky-test",
      roomState,
      runState,
      driver: {
        state: "active",
        memberId: "member_alice",
        displayName: "Alice",
        leaseVersion: 1,
      },
      policySummary: "Approvals: network, workspace write · Worktree isolated",
      retentionUntil: "2026-10-28",
      members: baseMembers,
      pendingApprovals:
        seed === "approval"
          ? [
              {
                approvalId: "apr_1",
                category: "network",
                evidenceDigest: "sha256:evidence_demo",
                state: "visible",
                summary: "Allow outbound HTTPS to registry.npmjs.org for dependency lookup",
              },
            ]
          : [],
      pendingSuggestions:
        seed === "empty"
          ? []
          : [
              {
                suggestionId: "sug_1",
                text: "Edge case may be DST transition in America/Los_Angeles.",
                authorId: "member_bob",
                authorName: "Bob",
              },
            ],
      events,
      lastSequence: events.at(-1)?.sequence ?? 0,
    });

    this.connection.set(
      roomId,
      seed === "loading"
        ? "connecting"
        : seed === "reconnect" || seed === "degraded"
          ? "reconnecting"
          : seed === "error"
            ? "offline"
            : "live",
    );
  }

  setSession(session: SessionIdentity | null): void {
    this.session = session;
  }

  setFailNext(value: boolean): void {
    this.failNext = value;
  }

  async getSession(): Promise<SessionIdentity | null> {
    return this.session;
  }

  async getRoom(roomId: string): Promise<RoomSnapshot> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Room unavailable (AUTHZ_PERMISSION_DENIED)");
    }
    if (!this.rooms.has(roomId)) {
      this.seedRoom(roomId, "active");
    }
    return structuredClone(this.rooms.get(roomId)!);
  }

  async listEvents(roomId: string, afterSequence: number): Promise<RoomEvent[]> {
    const room = await this.getRoom(roomId);
    return room.events.filter((e) => e.sequence > afterSequence);
  }

  subscribe(roomId: string, _afterSequence: number, handlers: Listener): () => void {
    const set = this.listeners.get(roomId) ?? new Set();
    set.add(handlers);
    this.listeners.set(roomId, set);
    handlers.onConnection(this.connection.get(roomId) ?? "live");
    return () => {
      set.delete(handlers);
    };
  }

  private emit(roomId: string, event: RoomEvent): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.events.push(event);
    room.lastSequence = event.sequence;
    for (const listener of this.listeners.get(roomId) ?? []) {
      listener.onEvent(event);
    }
  }

  private nextSequence(roomId: string): number {
    return (this.rooms.get(roomId)?.lastSequence ?? 0) + 1;
  }

  async submitInput(roomId: string, request: SubmitInputRequest) {
    const session = this.session;
    if (!session) return { ok: false as const, message: "Not signed in" };
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false as const, message: "Room not found" };
    if (this.connection.get(roomId) === "offline") {
      return {
        ok: false as const,
        message: "offline — draft retained; retry when reconnecting completes",
      };
    }

    const seq = this.nextSequence(roomId);
    const actor = {
      type: "member" as const,
      id: session.memberId,
      displayName: session.displayName,
    };

    if (request.mode === "comment") {
      this.emit(
        roomId,
        makeEvent({
          roomId,
          sequence: seq,
          actor,
          type: "input.commented",
          payload: { text: request.text },
        }),
      );
    } else if (request.mode === "suggest") {
      const suggestionId = `sug_${seq}`;
      this.emit(
        roomId,
        makeEvent({
          roomId,
          sequence: seq,
          actor,
          type: "input.suggested",
          payload: { suggestionId, text: request.text },
        }),
      );
      room.pendingSuggestions.push({
        suggestionId,
        text: request.text,
        authorId: session.memberId,
        authorName: session.displayName,
      });
    } else if (request.mode === "queue") {
      this.emit(
        roomId,
        makeEvent({
          roomId,
          sequence: seq,
          actor,
          type: "input.queued",
          payload: { inputId: `in_${seq}`, text: request.text },
        }),
      );
    } else {
      this.emit(
        roomId,
        makeEvent({
          roomId,
          sequence: seq,
          actor,
          type: "input.steered",
          payload: { inputId: `in_${seq}`, text: request.text, turnId: "turn_1" },
        }),
      );
    }

    return { ok: true as const };
  }

  async requestDriver(roomId: string) {
    const session = this.session;
    if (!session) return { ok: false as const, message: "Not signed in" };
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false as const, message: "Room not found" };
    room.driver.state = "requested";
    this.emit(
      roomId,
      makeEvent({
        roomId,
        sequence: this.nextSequence(roomId),
        actor: { type: "member", id: session.memberId, displayName: session.displayName },
        type: "driver.requested",
        payload: { memberId: session.memberId, expectedLeaseVersion: room.driver.leaseVersion },
      }),
    );
    return { ok: true as const };
  }

  async handoffDriver(roomId: string, toMemberId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false as const, message: "Room not found" };
    const member = room.members.find((m) => m.memberId === toMemberId);
    room.driver = {
      state: "active",
      memberId: toMemberId,
      displayName: member?.displayName ?? toMemberId,
      leaseVersion: room.driver.leaseVersion + 1,
    };
    this.emit(
      roomId,
      makeEvent({
        roomId,
        sequence: this.nextSequence(roomId),
        actor: { type: "system", id: "system" },
        type: "driver.changed",
        payload: { memberId: toMemberId, leaseVersion: room.driver.leaseVersion },
      }),
    );
    return { ok: true as const };
  }

  async reclaimDriver(roomId: string) {
    return this.handoffDriver(roomId, "member_alice");
  }

  async resolveApproval(roomId: string, request: ResolveApprovalRequest) {
    const session = this.session;
    if (!session) return { ok: false as const, message: "Not signed in" };
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false as const, message: "Room not found" };
    const pending = room.pendingApprovals.find((a) => a.approvalId === request.approvalId);
    if (!pending) return { ok: false as const, message: "stale — approval no longer pending" };
    if (pending.evidenceDigest !== request.evidenceDigest) {
      return { ok: false as const, message: "evidence mismatch" };
    }
    room.pendingApprovals = room.pendingApprovals.filter(
      (a) => a.approvalId !== request.approvalId,
    );
    room.runState = request.decision === "allow" ? "running" : "failed";
    this.emit(
      roomId,
      makeEvent({
        roomId,
        sequence: this.nextSequence(roomId),
        actor: { type: "member", id: session.memberId, displayName: session.displayName },
        type: "approval.resolved",
        payload: {
          approvalId: request.approvalId,
          decision: request.decision,
          evidenceDigest: request.evidenceDigest,
        },
      }),
    );
    return { ok: true as const };
  }

  simulateDisconnect(roomId: string): void {
    this.connection.set(roomId, "offline");
    const room = this.rooms.get(roomId);
    if (room) room.roomState = "reconnecting";
    for (const listener of this.listeners.get(roomId) ?? []) {
      listener.onConnection("offline");
    }
  }

  simulateReconnect(roomId: string): void {
    this.connection.set(roomId, "catching_up");
    for (const listener of this.listeners.get(roomId) ?? []) {
      listener.onConnection("catching_up");
    }
    const room = this.rooms.get(roomId);
    if (!room) return;
    const seq = this.nextSequence(roomId);
    const event = makeEvent({
      roomId,
      sequence: seq,
      actor: { type: "system", id: "system" },
      type: "room.host_connected",
      payload: {},
    });
    room.roomState = "active";
    this.connection.set(roomId, "live");
    this.emit(roomId, event);
    for (const listener of this.listeners.get(roomId) ?? []) {
      listener.onConnection("live");
    }
  }
}
