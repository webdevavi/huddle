import { describe, expect, it } from "vitest";
import {
  MemoryFunnelSink,
  createFunnelSink,
  scorePhaseGate,
} from "../index.js";

describe("analytics funnel", () => {
  it("defaults self-host telemetry to null sink", () => {
    const prev = process.env.HUDDLE_TELEMETRY;
    delete process.env.HUDDLE_TELEMETRY;
    const sink = createFunnelSink();
    expect(sink.constructor.name).toBe("NullFunnelSink");
    if (prev === undefined) delete process.env.HUDDLE_TELEMETRY;
    else process.env.HUDDLE_TELEMETRY = prev;
  });

  it("records content-free events in memory", () => {
    const sink = new MemoryFunnelSink();
    sink.emit({ name: "cli_invoked", ts: new Date().toISOString() });
    sink.emit({
      name: "intervention_applied",
      ts: new Date().toISOString(),
      interventionKind: "handoff",
      latencyMs: 1200,
    });
    expect(sink.events).toHaveLength(2);
  });

  it("scores phase gate thresholds", () => {
    const fail = scorePhaseGate({
      pairsCompleted: 3,
      meaningfulInterventions: 2,
      wouldUseAgain: 1,
      roomsWithInviteOpened: 10,
      roomsWithJoinCompleted: 4,
      twoPersonRooms: 3,
      interventionLatenciesMs: [500, 800],
      roomsCompleted: 3,
      repeatRoomsWithin14d: 0,
    });
    expect(fail.gatePassed).toBe(false);
    expect(fail.reasons.length).toBeGreaterThan(0);

    const pass = scorePhaseGate({
      pairsCompleted: 10,
      meaningfulInterventions: 6,
      wouldUseAgain: 5,
      roomsWithInviteOpened: 10,
      roomsWithJoinCompleted: 8,
      twoPersonRooms: 10,
      interventionLatenciesMs: [10, 20, 30],
      roomsCompleted: 10,
      repeatRoomsWithin14d: 3,
    });
    expect(pass.gatePassed).toBe(true);
    expect(pass.medianInterventionLatencyMs).toBe(20);
    expect(pass.inviteJoinActivation).toBe(0.8);
  });
});
