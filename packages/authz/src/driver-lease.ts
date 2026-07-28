/**
 * Driver lease fields (§9.3). State machine lives in @huddle/protocol;
 * this package owns the authorization lease record shape.
 */
export type DriverLease = {
  roomId: string;
  memberId: string;
  leaseVersion: number;
  acquiredAt: string;
  expiresAt: string;
  lastActivityAt: string;
};

export type LeaseCheckInput = {
  lease: DriverLease;
  expectedLeaseVersion: number;
  memberId: string;
  nowIso: string;
};

export type LeaseCheckResult =
  | { ok: true }
  | { ok: false; reason: "stale_version" | "wrong_holder" | "expired" };

export function checkDriverLease(input: LeaseCheckInput): LeaseCheckResult {
  if (input.lease.memberId !== input.memberId) {
    return { ok: false, reason: "wrong_holder" };
  }
  if (input.lease.leaseVersion !== input.expectedLeaseVersion) {
    return { ok: false, reason: "stale_version" };
  }
  if (Date.parse(input.nowIso) > Date.parse(input.lease.expiresAt)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

/** Capabilities that require an active matching driver lease. */
export const LEASE_REQUIRED_CAPABILITIES = [
  "room.queue",
  "room.steer",
  "room.interrupt",
  "driver.handoff",
] as const;
