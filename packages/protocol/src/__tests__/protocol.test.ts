import { describe, expect, it } from "vitest";
import { FakeClock, FakeIdGenerator, FaultTransport, fc, runProperty } from "@huddle/testkit";
import {
  PROTOCOL_SCHEMA_VERSION,
  ROOM_EVENT_TYPES,
  createHuddleError,
  createRoomEventEnvelope,
  defaultLocalOffer,
  isEffectTerminal,
  negotiateCompatibility,
  parseRoomEvent,
  transitionApproval,
  transitionDriverLease,
  transitionEffect,
  transitionRoom,
  transitionRun,
  initialApproval,
  initialDriverLease,
  type EffectStatus,
  type RoomEvent,
} from "../index.js";

function baseEvent(
  overrides: Partial<RoomEvent<"room.created">> & { type?: "room.created" } = {},
): RoomEvent<"room.created"> {
  return createRoomEventEnvelope({
    eventId: "evt_1",
    roomId: "room_1",
    roomIncarnation: "inc_1",
    sequence: 1,
    timestamp: "2026-07-28T00:00:00.000Z",
    actor: { type: "system", id: "system" },
    type: "room.created",
    payload: { slug: "quiet-sunrise" },
    visibility: "room",
    ...overrides,
  });
}

describe("parseRoomEvent", () => {
  it("parses a known room.created event", () => {
    const result = parseRoomEvent(baseEvent());
    expect(result.ok).toBe(true);
    if (result.ok && result.known) {
      expect(result.event.type).toBe("room.created");
      expect(result.event.schemaVersion).toBe(PROTOCOL_SCHEMA_VERSION);
      expect(result.event.payload).toEqual({ slug: "quiet-sunrise" });
    }
  });

  it("stores and skips unknown event types without coercing", () => {
    const raw = {
      ...baseEvent(),
      type: "future.widget_spawned",
      payload: { widgetId: "w1" },
    };
    const result = parseRoomEvent(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.known).toBe(false);
      expect(result.event.type).toBe("future.widget_spawned");
    }
  });

  it("rejects invalid envelopes", () => {
    const result = parseRoomEvent({ type: "room.created" });
    expect(result.ok).toBe(false);
  });

  it("rejects known type with invalid payload", () => {
    const result = parseRoomEvent({
      ...baseEvent(),
      payload: { notSlug: true },
    });
    expect(result.ok).toBe(false);
  });

  it("covers every core event type from the catalog", () => {
    expect(ROOM_EVENT_TYPES.length).toBeGreaterThanOrEqual(40);
    for (const type of ROOM_EVENT_TYPES) {
      expect(type.includes(".")).toBe(true);
    }
  });
});

describe("state machines", () => {
  it("transitions room per §30", () => {
    expect(transitionRoom("creating", "runner_registered").state).toBe("waiting_for_runner");
    expect(transitionRoom("waiting_for_runner", "runner_ready").state).toBe("active");
    expect(transitionRoom("active", "heartbeat_missed").state).toBe("reconnecting");
    expect(transitionRoom("reconnecting", "runner_recovered").state).toBe("active");
    expect(transitionRoom("archived", "runner_ready").ok).toBe(false);
  });

  it("uses running (not active) for run state", () => {
    let state = transitionRun("starting", "ready");
    expect(state.state).toBe("idle");
    state = transitionRun("idle", "start_turn");
    expect(state.state).toBe("running");
    state = transitionRun("running", "await_approval");
    expect(state.state).toBe("awaiting_approval");
    state = transitionRun("awaiting_approval", "approval_denied");
    expect(state.state).toBe("failed");
  });

  it("advances driver lease versions on grant/handoff", () => {
    let lease = initialDriverLease();
    const granted = transitionDriverLease(lease, "grant", "member_a");
    expect(granted.ok).toBe(true);
    expect(granted.state.state).toBe("active");
    expect(granted.state.leaseVersion).toBe(1);
    lease = granted.state;
    const pending = transitionDriverLease(lease, "begin_handoff");
    expect(pending.state.state).toBe("handoff_pending");
    const handed = transitionDriverLease(pending.state, "complete_handoff", "member_b");
    expect(handed.state.memberId).toBe("member_b");
    expect(handed.state.leaseVersion).toBe(2);
  });

  it("moves approval requested → visible → resolved → consumed", () => {
    let snap = initialApproval();
    snap = transitionApproval(snap, "make_visible").state;
    snap = transitionApproval(snap, "resolve", "allow").state;
    expect(snap.state).toBe("resolved");
    snap = transitionApproval(snap, "consume").state;
    expect(snap.state).toBe("consumed");
    expect(transitionApproval(snap, "consume").ok).toBe(false);
  });

  it("enforces effect lifecycle forward transitions", () => {
    expect(transitionEffect("received", "authorized").ok).toBe(true);
    expect(transitionEffect("authorized", "durable").ok).toBe(true);
    expect(transitionEffect("durable", "applied").ok).toBe(false);
    expect(transitionEffect("provider_submitted", "unknown").ok).toBe(true);
    expect(isEffectTerminal("applied")).toBe(true);
  });
});

describe("compatibility negotiation", () => {
  it("accepts matching current/current offers", () => {
    const result = negotiateCompatibility(
      defaultLocalOffer(),
      defaultLocalOffer(),
      "diag_compat_1",
    );
    expect(result).toEqual({
      ok: true,
      mode: "full",
      negotiatedProtocol: PROTOCOL_SCHEMA_VERSION,
      missingOptional: [],
    });
  });

  it("falls back to observation-only when required caps missing", () => {
    const peer = defaultLocalOffer({
      requiredCapabilities: ["room_events_v1"],
    });
    const result = negotiateCompatibility(defaultLocalOffer(), peer, "diag_compat_2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mode).toBe("observation_only");
    }
  });

  it("rejects non-overlapping versions", () => {
    const result = negotiateCompatibility(
      defaultLocalOffer({ minProtocol: 2, maxProtocol: 2 }),
      defaultLocalOffer({ minProtocol: 1, maxProtocol: 1 }),
      "diag_compat_3",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROTOCOL_INCOMPATIBLE");
    }
  });
});

describe("errors", () => {
  it("builds stable error envelopes", () => {
    const err = createHuddleError({
      code: "STATE_INVALID_TRANSITION",
      message: "Invalid transition. Refresh room state and retry.",
      diagnosticId: "diag_err_1",
    });
    expect(err.documentationSlug).toBe("errors/state-invalid-transition");
    expect(err.retryable).toBe(false);
  });
});

describe("testkit hooks", () => {
  it("provides deterministic clock and ids", () => {
    const clock = new FakeClock("2026-07-28T00:00:00.000Z");
    const ids = new FakeIdGenerator();
    expect(ids.eventId()).toBe("evt_00000001");
    clock.advance(1000);
    expect(clock.nowIso()).toBe("2026-07-28T00:00:01.000Z");
  });

  it("fault transport can drop and duplicate", () => {
    const drop = new FaultTransport<string>({ mode: "drop" });
    expect(drop.send("a")).toEqual([]);
    const dup = new FaultTransport<string>({ mode: "duplicate" });
    expect(dup.send("a")).toEqual(["a", "a"]);
  });
});

describe("property: effect transitions never skip ahead from non-terminal", () => {
  const statuses = [
    "received",
    "authorized",
    "durable",
    "dispatched",
    "runner_durable",
    "provider_submitted",
    "applied",
    "rejected",
    "cancelled",
    "expired",
    "unknown",
  ] as const satisfies readonly EffectStatus[];

  it("rejects impossible leaps consistently", () => {
    runProperty(fc.constantFrom(...statuses), (from) => {
      const leap = transitionEffect(from, "applied");
      if (from === "applied") {
        expect(leap.ok).toBe(true);
        expect(leap.changed).toBe(false);
        return;
      }
      if (from === "provider_submitted") {
        expect(leap.ok).toBe(true);
        return;
      }
      if (isEffectTerminal(from)) {
        expect(leap.ok).toBe(false);
        return;
      }
      expect(leap.ok).toBe(false);
    });
  });
});
