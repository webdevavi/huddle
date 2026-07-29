export {
  MEMBERSHIP_ROLES,
  CAPABILITIES,
  ROLE_CAPABILITIES,
  roleHasCapability,
  capabilitiesForRole,
  type MembershipRole,
  type Capability,
} from "./capabilities.js";

export {
  checkDriverLease,
  LEASE_REQUIRED_CAPABILITIES,
  type DriverLease,
  type LeaseCheckInput,
  type LeaseCheckResult,
} from "./driver-lease.js";

export {
  StubEvidenceDigester,
  StubApprovalVerifier,
  type DigestAlgorithm,
  type ApprovalEvidenceDigest,
  type ApprovalDecision,
  type ApprovalCapabilityGrant,
  type SignedApprovalEvidence,
  type EvidenceMaterial,
  type VerifyContext,
  type VerifyResult,
  type EvidenceDigester,
  type ApprovalVerifier,
} from "./approval-evidence.js";

export {
  authorizeMutation,
  type MutationAuthzInput,
  type MutationAuthzResult,
} from "./policy.js";

// Node crypto (Ed25519) lives in `@huddle/authz/crypto` so browsers can import
// role/capability types without pulling `node:crypto`.
