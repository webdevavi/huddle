import { roleHasCapability, type Capability, type MembershipRole } from "./capabilities.js";
import {
  LEASE_REQUIRED_CAPABILITIES,
  checkDriverLease,
  type DriverLease,
} from "./driver-lease.js";

export type MutationAuthzInput = {
  role: MembershipRole;
  capability: Capability;
  memberId: string;
  lease?: DriverLease;
  expectedLeaseVersion?: number;
  nowIso: string;
  /** Extra approval categories granted beyond role defaults. */
  grantedApprovalCategories?: readonly string[];
};

export type MutationAuthzResult =
  | { ok: true }
  | { ok: false; reason: "capability_missing" | "lease_required" | "lease_invalid" };

export function authorizeMutation(input: MutationAuthzInput): MutationAuthzResult {
  const hasRoleCap = roleHasCapability(input.role, input.capability);
  const approvalCap = input.capability.startsWith("approval.resolve.");
  const category = approvalCap ? input.capability.slice("approval.resolve.".length) : null;
  const hasGrant =
    category !== null && (input.grantedApprovalCategories?.includes(category) ?? false);

  if (!hasRoleCap && !hasGrant) {
    return { ok: false, reason: "capability_missing" };
  }

  const needsLease = (LEASE_REQUIRED_CAPABILITIES as readonly string[]).includes(input.capability);
  if (!needsLease) {
    return { ok: true };
  }

  if (!input.lease || input.expectedLeaseVersion === undefined) {
    return { ok: false, reason: "lease_required" };
  }

  const leaseCheck = checkDriverLease({
    lease: input.lease,
    expectedLeaseVersion: input.expectedLeaseVersion,
    memberId: input.memberId,
    nowIso: input.nowIso,
  });

  if (!leaseCheck.ok) {
    return { ok: false, reason: "lease_invalid" };
  }

  return { ok: true };
}
