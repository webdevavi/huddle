import { allow, rejectInvalid, rejectTerminal, type TransitionResult } from "./result.js";

/**
 * Room connectivity / lifecycle state (§12.1 / §30).
 * UI may label connectivity loosely; protocol enum values are as below.
 */
export const ROOM_STATES = [
  "creating",
  "waiting_for_runner",
  "active",
  "reconnecting",
  "degraded",
  "archiving",
  "archived",
  "failed",
] as const;

export type RoomState = (typeof ROOM_STATES)[number];

export type RoomTransition =
  | "runner_registered"
  | "runner_ready"
  | "heartbeat_missed"
  | "runner_recovered"
  | "degrade"
  | "recover_from_degraded"
  | "begin_archive"
  | "archive_complete"
  | "fail";

const TERMINAL: ReadonlySet<RoomState> = new Set(["archived", "failed"]);

export function isRoomTerminal(state: RoomState): boolean {
  return TERMINAL.has(state);
}

export function transitionRoom(state: RoomState, event: RoomTransition): TransitionResult<RoomState> {
  if (isRoomTerminal(state)) {
    return rejectTerminal(state);
  }

  switch (state) {
    case "creating":
      if (event === "runner_registered") return allow("waiting_for_runner");
      if (event === "fail") return allow("failed");
      break;
    case "waiting_for_runner":
      if (event === "runner_ready") return allow("active");
      if (event === "fail") return allow("failed");
      break;
    case "active":
      if (event === "heartbeat_missed") return allow("reconnecting");
      if (event === "degrade") return allow("degraded");
      if (event === "begin_archive") return allow("archiving");
      break;
    case "reconnecting":
      if (event === "runner_recovered") return allow("active");
      if (event === "degrade") return allow("degraded");
      if (event === "begin_archive") return allow("archiving");
      break;
    case "degraded":
      if (event === "recover_from_degraded") return allow("active");
      if (event === "begin_archive") return allow("archiving");
      break;
    case "archiving":
      if (event === "archive_complete") return allow("archived");
      break;
    default:
      break;
  }

  return rejectInvalid(state);
}
