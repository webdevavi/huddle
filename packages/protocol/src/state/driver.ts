import { allow, rejectInvalid, rejectTerminal, type TransitionResult } from "./result.js";

/**
 * Driver lease state machine (§30).
 * `expired` and `revoked` are transitional outcomes that resolve to `unassigned`.
 */
export const DRIVER_LEASE_STATES = [
  "unassigned",
  "requested",
  "active",
  "handoff_pending",
] as const;

export type DriverLeaseState = (typeof DRIVER_LEASE_STATES)[number];

export type DriverLeaseTransition =
  | "request"
  | "grant"
  | "begin_handoff"
  | "complete_handoff"
  | "expire"
  | "revoke"
  | "reject_request";

export type DriverLeaseSnapshot = {
  state: DriverLeaseState;
  memberId: string | null;
  leaseVersion: number;
};

export function initialDriverLease(): DriverLeaseSnapshot {
  return { state: "unassigned", memberId: null, leaseVersion: 0 };
}

export function transitionDriverLease(
  current: DriverLeaseSnapshot,
  event: DriverLeaseTransition,
  nextMemberId?: string | null,
): TransitionResult<DriverLeaseSnapshot> {
  const { state } = current;

  switch (state) {
    case "unassigned":
      if (event === "request") {
        return allow({
          state: "requested",
          memberId: nextMemberId ?? current.memberId,
          leaseVersion: current.leaseVersion,
        });
      }
      if (event === "grant" && nextMemberId) {
        return allow({
          state: "active",
          memberId: nextMemberId,
          leaseVersion: current.leaseVersion + 1,
        });
      }
      break;
    case "requested":
      if (event === "grant" && nextMemberId) {
        return allow({
          state: "active",
          memberId: nextMemberId,
          leaseVersion: current.leaseVersion + 1,
        });
      }
      if (event === "reject_request" || event === "expire" || event === "revoke") {
        return allow({ state: "unassigned", memberId: null, leaseVersion: current.leaseVersion });
      }
      break;
    case "active":
      if (event === "begin_handoff") {
        return allow({
          state: "handoff_pending",
          memberId: current.memberId,
          leaseVersion: current.leaseVersion,
        });
      }
      if (event === "expire" || event === "revoke") {
        return allow({
          state: "unassigned",
          memberId: null,
          leaseVersion: current.leaseVersion,
        });
      }
      break;
    case "handoff_pending":
      if (event === "complete_handoff" && nextMemberId) {
        return allow({
          state: "active",
          memberId: nextMemberId,
          leaseVersion: current.leaseVersion + 1,
        });
      }
      if (event === "expire" || event === "revoke") {
        return allow({
          state: "unassigned",
          memberId: null,
          leaseVersion: current.leaseVersion,
        });
      }
      break;
    default:
      return rejectTerminal(current);
  }

  return rejectInvalid(current);
}
