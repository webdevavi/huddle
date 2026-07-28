import { Hono } from "hono";
import { transitionDriverLease } from "@huddle/protocol";
import type { Capability } from "@huddle/authz";
import { decodeCursor } from "@huddle/persistence";
import type { ControlPlaneDeps } from "../config.js";
import { FakeAuthService, approvalCapability, capabilityForInputKind, requestHash } from "../auth/fake.js";
import { huddleError, jsonError } from "./errors.js";
import { readSessionId, requireSession, withSessionCookie } from "./session.js";
import { mintWsTicket } from "../ws/tickets.js";
import type { RoomHub } from "../ws/hub.js";

type Variables = {
  deps: ControlPlaneDeps;
  auth: FakeAuthService;
};

function visibilityForRole(role: string): Set<string> {
  if (role === "owner") return new Set(["room", "approvers", "owner"]);
  if (role === "collaborator") return new Set(["room", "approvers"]);
  return new Set(["room"]);
}

export function createApp(deps: ControlPlaneDeps, hub: RoomHub): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  const auth = new FakeAuthService(deps.store, deps.clock, deps.ids);

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    c.set("auth", auth);
    await next();
  });

  app.get("/healthz", (c) => c.json({ ok: true }));

  /** Fake auth: exchange identity header for a session cookie/token. */
  app.post("/v1/auth/session", async (c) => {
    const session = auth.ensureSession(c.req.header("x-huddle-user") ?? undefined);
    const headers = withSessionCookie(session.sessionId);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify({ session }), { status: 200, headers });
  });

  app.post("/v1/rooms", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;

    const body = (await c.req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
    };
    const slug = body.slug?.trim() || `room-${deps.ids.uuid()}`;
    if (deps.store.getRoomBySlug(slug)) {
      return jsonError(
        huddleError("STATE_INVALID_TRANSITION", "slug already in use", "room_slug_taken"),
        409,
      );
    }

    const created = deps.store.createRoom({
      roomId: deps.ids.uuid(),
      slug,
      ...(body.name === undefined ? {} : { name: body.name }),
      incarnation: deps.ids.uuid(),
      ownerUserId: session.userId,
      ownerMemberId: deps.ids.uuid(),
      ownerDisplayName: session.displayName,
      nowIso: deps.clock.nowIso(),
    });

    return c.json(
      {
        room: created.room,
        member: created.member,
        lease: created.lease,
        event: created.event,
      },
      201,
    );
  });

  app.get("/v1/rooms/:roomId", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const room = deps.store.getRoom(roomId);
    if (!room) {
      return jsonError(huddleError("INTERNAL", "room not found", "room_missing"), 404);
    }
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    if (!member) {
      return jsonError(
        huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"),
        403,
      );
    }
    return c.json({
      room,
      member,
      lease: deps.store.getDriverLease(roomId),
      members: deps.store.listMembers(roomId),
    });
  });

  app.post("/v1/rooms/:roomId/invites", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    if (!member) {
      return jsonError(
        huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"),
        403,
      );
    }
    const room = deps.store.getRoom(roomId);
    if (!room) {
      return jsonError(huddleError("INTERNAL", "room not found", "room_missing"), 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      role?: "viewer" | "collaborator" | "owner";
      expectedMembershipVersion?: number;
    };
    if (member.role !== "owner") {
      return jsonError(
        huddleError("AUTHZ_CAPABILITY_MISSING", "member.manage required", "cap_missing"),
        403,
      );
    }
    const expected =
      body.expectedMembershipVersion ?? room.membershipVersion;
    const invite = deps.store.createInvite({
      inviteId: deps.ids.uuid(),
      roomId,
      token: deps.ids.uuid(),
      role: body.role ?? "collaborator",
      createdByMemberId: member.memberId,
      expiresAt: new Date(deps.clock.nowMs() + 7 * 24 * 3600 * 1000).toISOString(),
      nowIso: deps.clock.nowIso(),
      expectedMembershipVersion: expected,
    });
    if ("error" in invite) {
      return jsonError(
        huddleError(
          invite.error === "membership_version_mismatch"
            ? "AUTHZ_APPROVAL_STALE"
            : "AUTHZ_PERMISSION_DENIED",
          invite.error,
          "invite_create_failed",
        ),
        409,
      );
    }
    return c.json({ invite }, 201);
  });

  app.delete("/v1/rooms/:roomId/invites", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    if (!member || member.role !== "owner") {
      return jsonError(
        huddleError("AUTHZ_CAPABILITY_MISSING", "member.manage required", "cap_missing"),
        403,
      );
    }
    const room = deps.store.getRoom(roomId);
    if (!room) {
      return jsonError(huddleError("INTERNAL", "room not found", "room_missing"), 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      inviteId?: string;
      expectedMembershipVersion?: number;
    };
    if (!body.inviteId) {
      return jsonError(huddleError("INTERNAL", "inviteId required", "bad_request"), 400);
    }
    const ok = deps.store.revokeInvite(
      roomId,
      body.inviteId,
      body.expectedMembershipVersion ?? room.membershipVersion,
    );
    return c.json({ revoked: ok });
  });

  app.post("/v1/rooms/:roomId/join", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const body = (await c.req.json().catch(() => ({}))) as { token?: string };
    if (!body.token) {
      return jsonError(huddleError("INTERNAL", "token required", "bad_request"), 400);
    }
    const result = deps.store.joinWithInvite({
      roomId,
      inviteToken: body.token,
      memberId: deps.ids.uuid(),
      userId: session.userId,
      displayName: session.displayName,
      nowIso: deps.clock.nowIso(),
      eventId: deps.ids.eventId(),
    });
    if ("error" in result) {
      return jsonError(
        huddleError("AUTHZ_PERMISSION_DENIED", result.error, "join_failed"),
        400,
      );
    }
    return c.json(result, 200);
  });

  app.post("/v1/rooms/:roomId/archive", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    const room = deps.store.getRoom(roomId);
    if (!member || !room) {
      return jsonError(huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"), 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      mutationId?: string;
      expectedMembershipVersion?: number;
    };
    const mutationId = body.mutationId ?? deps.ids.mutationId();
    const payload = { archive: true };
    const result = deps.store.commitMutation({
      mutationId,
      roomId,
      nowIso: deps.clock.nowIso(),
      requestHash: requestHash(payload),
      auth: {
        memberId: member.memberId,
        role: member.role,
        capability: "room.archive",
        expectedMembershipVersion: body.expectedMembershipVersion ?? room.membershipVersion,
      },
      events: [
        {
          eventId: deps.ids.eventId(),
          type: "room.archived",
          payload: {},
          actor: { type: "member", id: member.memberId, displayName: session.displayName },
          visibility: "room",
        },
      ],
      archive: true,
    });
    if (!result.ok) {
      return mutationError(result.code, result.message);
    }
    hub.drainRoom(roomId);
    return c.json({ receipt: result.receipt, events: result.events });
  });

  app.get("/v1/rooms/:roomId/events", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    if (!member) {
      return jsonError(
        huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"),
        403,
      );
    }
    const cursorRaw = c.req.query("cursor");
    const limitBytes = Number(c.req.query("limitBytes") ?? 2 * 1024 * 1024);
    let afterSequence = 0;
    if (cursorRaw) {
      const decoded = decodeCursor(cursorRaw);
      if (!decoded || decoded.roomId !== roomId) {
        return jsonError(huddleError("INTERNAL", "invalid cursor", "bad_cursor"), 400);
      }
      afterSequence = decoded.afterSequence;
    }
    const page = deps.store.getEventsAfter(roomId, afterSequence, {
      limitBytes: Number.isFinite(limitBytes) ? limitBytes : 2 * 1024 * 1024,
      visibility: visibilityForRole(member.role),
    });
    return c.json(page);
  });

  app.post("/v1/rooms/:roomId/inputs", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    const room = deps.store.getRoom(roomId);
    if (!member || !room) {
      return jsonError(huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"), 403);
    }
    const body = (await c.req.json()) as {
      mutationId?: string;
      kind: "comment" | "suggest" | "queue" | "steer";
      text: string;
      suggestionId?: string;
      inputId?: string;
      turnId?: string;
      expectedMembershipVersion?: number;
      expectedLeaseVersion?: number;
    };
    const capability = capabilityForInputKind(body.kind);
    const mutationId = body.mutationId ?? deps.ids.mutationId();
    const hashBody = { ...body, mutationId: undefined };
    const event = buildInputEvent(deps, member.memberId, session.displayName, body);
    const result = deps.store.commitMutation({
      mutationId,
      roomId,
      nowIso: deps.clock.nowIso(),
      requestHash: requestHash(hashBody),
      auth: {
        memberId: member.memberId,
        role: member.role,
        capability,
        expectedMembershipVersion: body.expectedMembershipVersion ?? room.membershipVersion,
        ...(body.expectedLeaseVersion === undefined
          ? {}
          : { expectedLeaseVersion: body.expectedLeaseVersion }),
      },
      events: [event],
    });
    if (!result.ok) return mutationError(result.code, result.message);
    hub.drainRoom(roomId);
    return c.json({ receipt: result.receipt, events: result.events });
  });

  app.post("/v1/rooms/:roomId/driver/request", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    const room = deps.store.getRoom(roomId);
    const lease = deps.store.getDriverLease(roomId);
    if (!member || !room || !lease) {
      return jsonError(huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"), 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      mutationId?: string;
      expectedMembershipVersion?: number;
      expectedLeaseVersion?: number;
    };
    const mutationId = body.mutationId ?? deps.ids.mutationId();
    const next = transitionDriverLease(
      {
        state: lease.state,
        memberId: lease.memberId,
        leaseVersion: lease.leaseVersion,
      },
      "request",
      member.memberId,
    );
    if (!next.ok) {
      return jsonError(
        huddleError("STATE_INVALID_TRANSITION", "driver request rejected", "driver_bad_state"),
        409,
      );
    }
    const result = deps.store.commitMutation({
      mutationId,
      roomId,
      nowIso: deps.clock.nowIso(),
      requestHash: requestHash(body),
      auth: {
        memberId: member.memberId,
        role: member.role,
        capability: "driver.request",
        expectedMembershipVersion: body.expectedMembershipVersion ?? room.membershipVersion,
        ...(body.expectedLeaseVersion === undefined
          ? {}
          : { expectedLeaseVersion: body.expectedLeaseVersion }),
      },
      events: [
        {
          eventId: deps.ids.eventId(),
          type: "driver.requested",
          payload: {
            memberId: member.memberId,
            ...(body.expectedLeaseVersion === undefined
              ? {}
              : { expectedLeaseVersion: body.expectedLeaseVersion }),
          },
          actor: { type: "member", id: member.memberId, displayName: session.displayName },
          visibility: "room",
        },
      ],
      leaseUpdate: {
        state: next.state.state,
        memberId: next.state.memberId,
        leaseVersion: next.state.leaseVersion,
        acquiredAt: lease.acquiredAt,
        expiresAt: lease.expiresAt,
        lastActivityAt: deps.clock.nowIso(),
      },
    });
    if (!result.ok) return mutationError(result.code, result.message);
    hub.drainRoom(roomId);
    return c.json({ receipt: result.receipt, events: result.events, lease: next.state });
  });

  app.post("/v1/rooms/:roomId/driver/handoff", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    const room = deps.store.getRoom(roomId);
    const lease = deps.store.getDriverLease(roomId);
    if (!member || !room || !lease) {
      return jsonError(huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"), 403);
    }
    const body = (await c.req.json()) as {
      mutationId?: string;
      toMemberId: string;
      expectedMembershipVersion?: number;
      expectedLeaseVersion: number;
    };
    const mutationId = body.mutationId ?? deps.ids.mutationId();
    const begin = transitionDriverLease(
      { state: lease.state, memberId: lease.memberId, leaseVersion: lease.leaseVersion },
      "begin_handoff",
    );
    if (!begin.ok) {
      return jsonError(
        huddleError("STATE_INVALID_TRANSITION", "handoff not allowed", "driver_bad_state"),
        409,
      );
    }
    const complete = transitionDriverLease(begin.state, "complete_handoff", body.toMemberId);
    if (!complete.ok) {
      return jsonError(
        huddleError("STATE_INVALID_TRANSITION", "handoff complete failed", "driver_bad_state"),
        409,
      );
    }
    const expiresAt = new Date(deps.clock.nowMs() + 60 * 60 * 1000).toISOString();
    const result = deps.store.commitMutation({
      mutationId,
      roomId,
      nowIso: deps.clock.nowIso(),
      requestHash: requestHash(body),
      auth: {
        memberId: member.memberId,
        role: member.role,
        capability: "driver.handoff",
        expectedMembershipVersion: body.expectedMembershipVersion ?? room.membershipVersion,
        expectedLeaseVersion: body.expectedLeaseVersion,
      },
      events: [
        {
          eventId: deps.ids.eventId(),
          type: "driver.changed",
          payload: {
            memberId: body.toMemberId,
            leaseVersion: complete.state.leaseVersion,
          },
          actor: { type: "member", id: member.memberId, displayName: session.displayName },
          visibility: "room",
        },
      ],
      leaseUpdate: {
        state: complete.state.state,
        memberId: complete.state.memberId,
        leaseVersion: complete.state.leaseVersion,
        acquiredAt: deps.clock.nowIso(),
        expiresAt,
        lastActivityAt: deps.clock.nowIso(),
      },
    });
    if (!result.ok) return mutationError(result.code, result.message);
    hub.drainRoom(roomId);
    return c.json({ receipt: result.receipt, events: result.events, lease: complete.state });
  });

  app.post("/v1/rooms/:roomId/approvals/:approvalId/resolve", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const approvalId = c.req.param("approvalId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    const room = deps.store.getRoom(roomId);
    if (!member || !room) {
      return jsonError(huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"), 403);
    }
    const body = (await c.req.json()) as {
      mutationId?: string;
      decision: "allow" | "deny" | "cancel";
      category: string;
      evidenceDigest: string;
      expectedMembershipVersion?: number;
    };
    const capability = approvalCapability(body.category);
    const mutationId = body.mutationId ?? deps.ids.mutationId();
    const result = deps.store.commitMutation({
      mutationId,
      roomId,
      nowIso: deps.clock.nowIso(),
      requestHash: requestHash(body),
      auth: {
        memberId: member.memberId,
        role: member.role,
        capability: capability as Capability,
        expectedMembershipVersion: body.expectedMembershipVersion ?? room.membershipVersion,
      },
      events: [
        {
          eventId: deps.ids.eventId(),
          type: "approval.resolved",
          payload: {
            approvalId,
            decision: body.decision,
            evidenceDigest: body.evidenceDigest,
          },
          actor: { type: "member", id: member.memberId, displayName: session.displayName },
          visibility: "approvers",
        },
      ],
      approvalUpsert: {
        roomId,
        approvalId,
        category: body.category,
        evidenceDigest: body.evidenceDigest,
        requestNonce: deps.ids.uuid(),
        status: "resolved",
        decision: body.decision,
        resolverMemberId: member.memberId,
        createdAt: deps.clock.nowIso(),
        resolvedAt: deps.clock.nowIso(),
      },
    });
    if (!result.ok) return mutationError(result.code, result.message);
    hub.drainRoom(roomId);
    return c.json({ receipt: result.receipt, events: result.events });
  });

  /** Issue a short-lived WS ticket for browser stream. */
  app.get("/v1/rooms/:roomId/stream", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const session = sessionOrErr;
    const roomId = c.req.param("roomId");
    const member = deps.store.getActiveMemberByUser(roomId, session.userId);
    if (!member) {
      return jsonError(
        huddleError("AUTHZ_PERMISSION_DENIED", "not a room member", "not_member"),
        403,
      );
    }
    const ticket = mintWsTicket(deps, {
      roomId,
      subjectType: "member",
      subjectId: member.memberId,
    });
    const highWaterMark = deps.store.getHighWaterMark(roomId);
    return c.json({
      ticket: ticket.id,
      expiresAt: ticket.expiresAt,
      highWaterMark,
      wsPath: `/v1/ws?ticket=${encodeURIComponent(ticket.id)}`,
    });
  });

  app.get("/v1/runner/connect", async (c) => {
    const sessionOrErr = requireSession({
      deps,
      auth,
      session: auth.resolveSession(readSessionId(c.req.raw.headers)),
    });
    if (sessionOrErr instanceof Response) return sessionOrErr;
    const roomId = c.req.query("roomId");
    if (!roomId) {
      return jsonError(huddleError("INTERNAL", "roomId required", "bad_request"), 400);
    }
    const expectedEpoch = Number(c.req.query("expectedEpoch") ?? 0);
    const newEpoch = deps.store.casRunnerEpoch(roomId, expectedEpoch, deps.clock.nowIso());
    if (newEpoch === null) {
      return jsonError(
        huddleError("RUNNER_EPOCH_STALE", "stale runner epoch", "epoch_stale"),
        409,
      );
    }
    const ticket = mintWsTicket(deps, {
      roomId,
      subjectType: "runner",
      subjectId: `runner-epoch-${newEpoch}`,
    });
    return c.json({
      ticket: ticket.id,
      runnerEpoch: newEpoch,
      highWaterMark: deps.store.getHighWaterMark(roomId),
      wsPath: `/v1/ws?ticket=${encodeURIComponent(ticket.id)}`,
    });
  });

  return app;
}

function mutationError(code: string, message: string): Response {
  const map: Record<string, { huddle: Parameters<typeof huddleError>[0]; status: number }> = {
    idempotency_conflict: { huddle: "STATE_INVALID_TRANSITION", status: 409 },
    room_not_found: { huddle: "INTERNAL", status: 404 },
    member_not_found: { huddle: "AUTHZ_PERMISSION_DENIED", status: 403 },
    membership_version_mismatch: { huddle: "AUTHZ_APPROVAL_STALE", status: 409 },
    capability_missing: { huddle: "AUTHZ_CAPABILITY_MISSING", status: 403 },
    lease_required: { huddle: "AUTHZ_LEASE_STALE", status: 403 },
    lease_invalid: { huddle: "AUTHZ_LEASE_STALE", status: 409 },
    room_archived: { huddle: "STATE_TERMINAL", status: 409 },
  };
  const mapped = map[code] ?? { huddle: "INTERNAL" as const, status: 500 };
  return jsonError(huddleError(mapped.huddle, message, code), mapped.status);
}

function buildInputEvent(
  deps: ControlPlaneDeps,
  memberId: string,
  displayName: string,
  body: {
    kind: "comment" | "suggest" | "queue" | "steer";
    text: string;
    suggestionId?: string;
    inputId?: string;
    turnId?: string;
  },
) {
  const actor = { type: "member" as const, id: memberId, displayName };
  switch (body.kind) {
    case "comment":
      return {
        eventId: deps.ids.eventId(),
        type: "input.commented" as const,
        payload: { text: body.text },
        actor,
        visibility: "room" as const,
      };
    case "suggest":
      return {
        eventId: deps.ids.eventId(),
        type: "input.suggested" as const,
        payload: {
          suggestionId: body.suggestionId ?? deps.ids.uuid(),
          text: body.text,
        },
        actor,
        visibility: "room" as const,
      };
    case "queue":
      return {
        eventId: deps.ids.eventId(),
        type: "input.queued" as const,
        payload: {
          inputId: body.inputId ?? deps.ids.uuid(),
          text: body.text,
        },
        actor,
        visibility: "room" as const,
      };
    case "steer":
      return {
        eventId: deps.ids.eventId(),
        type: "input.steered" as const,
        payload: {
          inputId: body.inputId ?? deps.ids.uuid(),
          text: body.text,
          ...(body.turnId === undefined ? {} : { turnId: body.turnId }),
        },
        actor,
        visibility: "room" as const,
      };
  }
}
