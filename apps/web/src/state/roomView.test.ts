import { describe, expect, it } from "vitest";
import { createRoomEventEnvelope } from "@huddle/protocol";
import {
  composerModesFor,
  groupEventsByTurn,
  initialRoomViewState,
  roomViewReducer,
} from "./roomView.js";

describe("roomViewReducer", () => {
  it("maps load success to empty when waiting for runner without events", () => {
    const state = roomViewReducer(initialRoomViewState(), {
      type: "load_success",
      session: { memberId: "m1", displayName: "A", role: "owner" },
      room: {
        roomId: "r1",
        slug: "s",
        repoName: "acme/app",
        branch: "main",
        roomState: "waiting_for_runner",
        runState: "idle",
        driver: { state: "unassigned", memberId: null, displayName: null, leaseVersion: 0 },
        policySummary: "p",
        retentionUntil: "2026-10-28",
        members: [],
        pendingApprovals: [],
        pendingSuggestions: [],
        events: [],
        lastSequence: 0,
      },
    });
    expect(state.phase).toBe("empty");
  });

  it("buffers events when not following live edge", () => {
    let state = roomViewReducer(initialRoomViewState(), {
      type: "load_success",
      session: null,
      room: {
        roomId: "r1",
        slug: "s",
        repoName: "acme/app",
        branch: "main",
        roomState: "active",
        runState: "running",
        driver: { state: "active", memberId: "a", displayName: "A", leaseVersion: 1 },
        policySummary: "p",
        retentionUntil: "2026-10-28",
        members: [],
        pendingApprovals: [],
        pendingSuggestions: [],
        events: [],
        lastSequence: 0,
      },
    });
    state = roomViewReducer(state, { type: "set_following", following: false });
    state = roomViewReducer(state, {
      type: "event",
      event: createRoomEventEnvelope({
        eventId: "e1",
        roomId: "r1",
        roomIncarnation: "i",
        sequence: 1,
        timestamp: new Date().toISOString(),
        actor: { type: "system", id: "system" },
        type: "room.host_connected",
        payload: {},
        visibility: "room",
      }),
    });
    expect(state.bufferedCount).toBe(1);
    expect(state.room?.events).toHaveLength(0);
  });
});

describe("composerModesFor", () => {
  it("disables queue/steer for collaborators without driver lease", () => {
    const modes = composerModesFor("collaborator", false, "live");
    expect(modes.find((m) => m.mode === "comment")?.enabled).toBe(true);
    expect(modes.find((m) => m.mode === "suggest")?.enabled).toBe(true);
    expect(modes.find((m) => m.mode === "queue")?.enabled).toBe(false);
    expect(modes.find((m) => m.mode === "steer")?.enabled).toBe(false);
  });

  it("disables queue/steer while offline even for driver", () => {
    const modes = composerModesFor("owner", true, "offline");
    expect(modes.find((m) => m.mode === "comment")?.enabled).toBe(true);
    expect(modes.find((m) => m.mode === "queue")?.enabled).toBe(false);
    expect(modes.find((m) => m.mode === "steer")?.reason).toMatch(/offline/);
  });
});

describe("groupEventsByTurn", () => {
  it("starts a turn on queued input", () => {
    const events = [
      createRoomEventEnvelope({
        eventId: "e1",
        roomId: "r1",
        roomIncarnation: "i",
        sequence: 1,
        timestamp: new Date().toISOString(),
        actor: { type: "member", id: "a" },
        type: "input.queued",
        payload: { inputId: "in1", text: "Fix test" },
        visibility: "room",
      }),
      createRoomEventEnvelope({
        eventId: "e2",
        roomId: "r1",
        roomIncarnation: "i",
        sequence: 2,
        timestamp: new Date().toISOString(),
        actor: { type: "agent", id: "agent" },
        type: "agent.plan_updated",
        payload: { planId: "p", summary: "Plan" },
        visibility: "room",
      }),
    ];
    const groups = groupEventsByTurn(events);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("Fix test");
    expect(groups[0]?.events).toHaveLength(2);
  });
});
