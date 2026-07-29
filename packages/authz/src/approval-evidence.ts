/**
 * Content-addressed approval evidence contracts (§9.4 / §48 / ENG-T1).
 * Cryptographic verification is intentionally stubbed; later lanes wire real crypto.
 */

export type DigestAlgorithm = "sha256";

export type ApprovalEvidenceDigest = {
  algorithm: DigestAlgorithm;
  hex: string;
};

export type ApprovalDecision = "allow" | "deny";

export type ApprovalCapabilityGrant = {
  memberId: string;
  categories: readonly string[];
  membershipVersion: number;
};

/**
 * Signed approval evidence fields bound by the runner before execution.
 * `signature` / `signerPublicKey` remain opaque until crypto is implemented.
 */
export type SignedApprovalEvidence = {
  roomIncarnation: string;
  runnerEpoch: number;
  requestNonce: string;
  evidenceDigest: ApprovalEvidenceDigest;
  decision: ApprovalDecision;
  expiresAt: string;
  membershipVersion: number;
  capabilityGrant: ApprovalCapabilityGrant;
  signerPublicKey: string;
  signature: string;
};

export type EvidenceMaterial = {
  category: string;
  command?: string;
  cwd?: string;
  affectedPaths?: readonly string[];
  providerExplanation?: string;
  raw: unknown;
};

export type VerifyContext = {
  roomIncarnation: string;
  runnerEpoch: number;
  expectedNonce: string;
  expectedDigest: ApprovalEvidenceDigest;
  nowIso: string;
  consumedNonces: ReadonlySet<string>;
};

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unsupported"
        | "wrong_room"
        | "stale_epoch"
        | "nonce_mismatch"
        | "nonce_replay"
        | "digest_mismatch"
        | "expired"
        | "bad_signature"
        | "unknown_signer"
        | "revoked_signer";
    };

export interface EvidenceDigester {
  digest(material: EvidenceMaterial): ApprovalEvidenceDigest;
}

export interface ApprovalVerifier {
  verify(evidence: SignedApprovalEvidence, context: VerifyContext): VerifyResult;
}

/** Fail-closed stub digester — does not claim cryptographic strength. */
export class StubEvidenceDigester implements EvidenceDigester {
  digest(material: EvidenceMaterial): ApprovalEvidenceDigest {
    const json = JSON.stringify(material);
    // Non-cryptographic placeholder for contract tests only.
    let hash = 0;
    for (let i = 0; i < json.length; i += 1) {
      hash = (hash * 31 + json.charCodeAt(i)) >>> 0;
    }
    return { algorithm: "sha256", hex: hash.toString(16).padStart(8, "0") };
  }
}

/**
 * Fail-closed stub verifier. Pure structural checks run; signature verification
 * always reports unsupported so execution lanes cannot accidentally trust it.
 */
export class StubApprovalVerifier implements ApprovalVerifier {
  verify(evidence: SignedApprovalEvidence, context: VerifyContext): VerifyResult {
    if (evidence.roomIncarnation !== context.roomIncarnation) {
      return { ok: false, reason: "wrong_room" };
    }
    if (evidence.runnerEpoch !== context.runnerEpoch) {
      return { ok: false, reason: "stale_epoch" };
    }
    if (evidence.requestNonce !== context.expectedNonce) {
      return { ok: false, reason: "nonce_mismatch" };
    }
    if (context.consumedNonces.has(evidence.requestNonce)) {
      return { ok: false, reason: "nonce_replay" };
    }
    if (
      evidence.evidenceDigest.algorithm !== context.expectedDigest.algorithm ||
      evidence.evidenceDigest.hex !== context.expectedDigest.hex
    ) {
      return { ok: false, reason: "digest_mismatch" };
    }
    if (Date.parse(context.nowIso) > Date.parse(evidence.expiresAt)) {
      return { ok: false, reason: "expired" };
    }
    // Cryptographic signature verification is not implemented in WS-A.
    return { ok: false, reason: "unsupported" };
  }
}
