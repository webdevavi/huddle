import { allow, rejectInvalid, rejectTerminal, type TransitionResult } from "./result.js";

/**
 * Provider-derived run state (§30 vocabulary).
 * UI may display "active" for `running`; protocol enum is `running`.
 */
export const RUN_STATES = [
  "starting",
  "idle",
  "running",
  "awaiting_approval",
  "completed",
  "interrupted",
  "failed",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export type RunTransition =
  | "ready"
  | "start_turn"
  | "await_approval"
  | "approval_allowed"
  | "approval_denied"
  | "interrupt"
  | "complete"
  | "fail"
  | "reset";

const TERMINAL: ReadonlySet<RunState> = new Set(["completed", "interrupted", "failed"]);

export function isRunTerminal(state: RunState): boolean {
  return TERMINAL.has(state);
}

/**
 * §30:
 * starting → idle → running ⇄ awaiting_approval → {completed|interrupted|failed}
 * denied (from awaiting_approval) → failed
 * starting can fail; idle reachable again from running via reset after terminal? Spec shows
 * completed/interrupted/failed as outcomes; idle loops back via reset from idle itself after
 * terminal hand-off is handled by starting a new run incarnation. We treat completed/
 * interrupted/failed as terminal for a given run aggregate.
 */
export function transitionRun(state: RunState, event: RunTransition): TransitionResult<RunState> {
  if (isRunTerminal(state)) {
    return rejectTerminal(state);
  }

  switch (state) {
    case "starting":
      if (event === "ready") return allow("idle");
      if (event === "fail") return allow("failed");
      break;
    case "idle":
      if (event === "start_turn") return allow("running");
      if (event === "fail") return allow("failed");
      break;
    case "running":
      if (event === "await_approval") return allow("awaiting_approval");
      if (event === "interrupt") return allow("interrupted");
      if (event === "complete") return allow("completed");
      if (event === "fail") return allow("failed");
      break;
    case "awaiting_approval":
      if (event === "approval_allowed") return allow("running");
      if (event === "approval_denied") return allow("failed");
      if (event === "interrupt") return allow("interrupted");
      if (event === "fail") return allow("failed");
      break;
    default:
      break;
  }

  return rejectInvalid(state);
}
