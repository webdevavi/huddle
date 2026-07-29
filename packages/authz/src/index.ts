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
  Sha256EvidenceDigester,
  Ed25519ApprovalSigner,
  Ed25519ApprovalVerifier,
  DeviceTrustStore,
  generateDeviceKeyPair,
  buildUnsignedEvidence,
  canonicalJson,
  type DeviceKeyPair,
  type TrustStore,
  type CryptoVerifyContext,
  type UnsignedApprovalEvidence,
  type ApprovalSigner,
} from "./crypto.js";

export {
  authorizeMutation,
  type MutationAuthzInput,
  type MutationAuthzResult,
} from "./policy.js";