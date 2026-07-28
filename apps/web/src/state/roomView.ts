import {
  LEASE_REQUIRED_CAPABILITIES,
  roleHasCapability,
  type Capability,
  type MembershipRole,
} from "@huddle/authz";
import type { RoomEvent } from "@huddle/protocol";
import type {
  ComposerMode,
  ConnectionStatus,
  RoomSnapshot,
  SessionIdentity,
} from "../client/types.js";

export type UiPhase = "loading" | "empty" | "error" | "success" | "degraded";

export type RoomViewState = {
  phase: UiPhase;
  errorMessage: string | null;
  connection: ConnectionStatus;
  session: SessionIdentity | null;
  room: RoomSnapshot | null;
  selectedEventId: string | null;
  bufferedCount: number;
  followingLiveEdge: boolean;
  draft: string;
  mode: ComposerMode;
  mobileSurface: "timeline" | "inspect" | "people";
  inspectorOpen: boolean;
};

export type RoomViewAction =
  | { type: "load_start" }
  | { type: "load_success"; room: RoomSnapshot; session: SessionIdentity | null }
  | { type: "load_error"; message: string }
  | { type: "connection"; status: ConnectionStatus }
  | { type: "event"; event: RoomEvent }
  | { type: "select_event"; eventId: string | null }
  | { type: "set_following"; following: boolean }
  | { type: "flush_buffer" }
  | { type: "set_draft"; draft: string }
  | { type: "set_mode"; mode: ComposerMode }
  | { type: "set_mobile_surface"; surface: RoomViewState["mobileSurface"] }
  | { type: "set_inspector_open"; open: boolean }
  | { type: "patch_room"; room: RoomSnapshot };

export function initialRoomViewState(): RoomViewState {
  return {
    phase: "loading",
    errorMessage: null,
    connection: "connecting",
    session: null,
    room: null,
    selectedEventId: null,
    bufferedCount: 0,
    followingLiveEdge: true,
    draft: "",
    mode: "comment",
    mobileSurface: "timeline",
    inspectorOpen: false,
  };
}

export function roomViewReducer(state: RoomViewState, action: RoomViewAction): RoomViewState {
  switch (action.type) {
    case "load_start":
      return { ...state, phase: "loading", errorMessage: null };
    case "load_success": {
      const empty =
        action.room.events.length === 0 && action.room.roomState === "waiting_for_runner";
      const degraded =
        action.room.roomState === "reconnecting" || action.room.roomState === "degraded";
      return {
        ...state,
        phase: empty ? "empty" : degraded ? "degraded" : "success",
        room: action.room,
        session: action.session,
        errorMessage: null,
        connection: degraded
          ? "reconnecting"
          : state.connection === "connecting"
            ? "live"
            : state.connection,
      };
    }
    case "load_error":
      return { ...state, phase: "error", errorMessage: action.message };
    case "connection": {
      const degraded =
        action.status === "reconnecting" ||
        action.status === "offline" ||
        action.status === "catching_up";
      return {
        ...state,
        connection: action.status,
        phase:
          state.phase === "error" || state.phase === "loading"
            ? state.phase
            : degraded
              ? "degraded"
              : state.room?.events.length
                ? "success"
                : "empty",
      };
    }
    case "event": {
      if (!state.room) return state;
      if (!state.followingLiveEdge) {
        return { ...state, bufferedCount: state.bufferedCount + 1 };
      }
      const events = [...state.room.events, action.event];
      return {
        ...state,
        room: {
          ...state.room,
          events,
          lastSequence: action.event.sequence,
        },
        phase: "success",
      };
    }
    case "flush_buffer":
      return { ...state, bufferedCount: 0, followingLiveEdge: true };
    case "select_event":
      return {
        ...state,
        selectedEventId: action.eventId,
        inspectorOpen: action.eventId !== null,
        mobileSurface: action.eventId ? "inspect" : state.mobileSurface,
      };
    case "set_following":
      return { ...state, followingLiveEdge: action.following };
    case "set_draft":
      return { ...state, draft: action.draft };
    case "set_mode":
      return { ...state, mode: action.mode };
    case "set_mobile_surface":
      return { ...state, mobileSurface: action.surface };
    case "set_inspector_open":
      return {
        ...state,
        inspectorOpen: action.open,
        selectedEventId: action.open ? state.selectedEventId : null,
      };
    case "patch_room": {
      const empty =
        action.room.events.length === 0 && action.room.roomState === "waiting_for_runner";
      const degraded =
        action.room.roomState === "reconnecting" || action.room.roomState === "degraded";
      return {
        ...state,
        room: action.room,
        phase: empty ? "empty" : degraded ? "degraded" : "success",
      };
    }
    default:
      return state;
  }
}

const MODE_CAPABILITY: Record<ComposerMode, Capability> = {
  comment: "room.comment",
  suggest: "room.suggest",
  queue: "room.queue",
  steer: "room.steer",
};

export type ModeAvailability = {
  mode: ComposerMode;
  enabled: boolean;
  reason?: string;
};

export function composerModesFor(
  role: MembershipRole | undefined,
  isDriver: boolean,
  connection: ConnectionStatus,
): ModeAvailability[] {
  const modes: ComposerMode[] = ["comment", "suggest", "queue", "steer"];
  return modes.map((mode) => {
    if (!role) {
      return { mode, enabled: false, reason: "Permissions resolving" };
    }
    if (!roleHasCapability(role, MODE_CAPABILITY[mode])) {
      return { mode, enabled: false, reason: `Role ${role} lacks ${MODE_CAPABILITY[mode]}` };
    }
    if (
      (LEASE_REQUIRED_CAPABILITIES as readonly string[]).includes(MODE_CAPABILITY[mode]) &&
      !isDriver
    ) {
      return { mode, enabled: false, reason: "Requires active driver lease" };
    }
    if (
      (connection === "offline" || connection === "reconnecting") &&
      (mode === "queue" || mode === "steer")
    ) {
      return { mode, enabled: false, reason: "offline — queue/steer disabled until live" };
    }
    return { mode, enabled: true };
  });
}

export function selectedEvent(state: RoomViewState): RoomEvent | null {
  if (!state.room || !state.selectedEventId) return null;
  return state.room.events.find((e) => e.eventId === state.selectedEventId) ?? null;
}

export function groupEventsByTurn(
  events: RoomEvent[],
): Array<{ turnId: string; title: string; events: RoomEvent[] }> {
  const groups: Array<{ turnId: string; title: string; events: RoomEvent[] }> = [];
  let current: { turnId: string; title: string; events: RoomEvent[] } | null = null;

  for (const event of events) {
    const startsTurn =
      event.type === "input.queued" ||
      event.type === "input.steered" ||
      event.type === "run.started";

    if (startsTurn || !current) {
      const title =
        event.type === "input.queued" || event.type === "input.steered"
          ? String((event.payload as { text?: string }).text ?? "Turn")
          : "Room activity";
      current = { turnId: `turn_${event.sequence}`, title, events: [event] };
      groups.push(current);
    } else {
      current.events.push(event);
    }
  }

  return groups;
}
