import { allow, rejectInvalid, rejectTerminal, type TransitionResult } from "./result.js";

/**
 * Approval state machine (§30).
 * resolved carries allow|deny; then consumed. rejected_stale is terminal.
 */
export const APPROVAL_STATES = [
  "requested",
  "visible",
  "resolved",
  "consumed",
  "expired",
  "revoked",
  "rejected_stale",
] as const;

export type ApprovalState = (typeof APPROVAL_STATES)[number];

export type ApprovalDecision = "allow" | "deny";

export type ApprovalTransition =
  | "make_visible"
  | "resolve"
  | "consume"
  | "expire"
  | "revoke"
  | "reject_stale";

export type ApprovalSnapshot = {
  state: ApprovalState;
  decision: ApprovalDecision | null;
};

export function initialApproval(): ApprovalSnapshot {
  return { state: "requested", decision: null };
}

const TERMINAL: ReadonlySet<ApprovalState> = new Set([
  "consumed",
  "expired",
  "revoked",
  "rejected_stale",
]);

export function isApprovalTerminal(state: ApprovalState): boolean {
  return TERMINAL.has(state);
}

export function transitionApproval(
  current: ApprovalSnapshot,
  event: ApprovalTransition,
  decision?: ApprovalDecision,
): TransitionResult<ApprovalSnapshot> {
  if (isApprovalTerminal(current.state)) {
    return rejectTerminal(current);
  }

  switch (current.state) {
    case "requested":
      if (event === "make_visible") return allow({ state: "visible", decision: null });
      if (event === "expire") return allow({ state: "expired", decision: null });
      if (event === "revoke") return allow({ state: "revoked", decision: null });
      break;
    case "visible":
      if (event === "resolve" && decision) {
        return allow({ state: "resolved", decision });
      }
      if (event === "expire") return allow({ state: "expired", decision: null });
      if (event === "revoke") return allow({ state: "revoked", decision: null });
      break;
    case "resolved":
      if (event === "consume") {
        return allow({ state: "consumed", decision: current.decision });
      }
      if (event === "reject_stale") {
        return allow({ state: "rejected_stale", decision: current.decision });
      }
      break;
    default:
      break;
  }

  return rejectInvalid(current);
}
