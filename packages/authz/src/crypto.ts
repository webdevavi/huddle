/**
 * Cryptographic approval evidence: SHA-256 digests + Ed25519 sign/verify.
 * Local device keys are authoritative for execution; the control plane cannot forge them.
 */

import { createHash, generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from "node:crypto";
import type {
  ApprovalCapabilityGrant,
  ApprovalDecision,
  ApprovalEvidenceDigest,
  ApprovalVerifier,
  EvidenceDigester,
  EvidenceMaterial,
  SignedApprovalEvidence,
  VerifyContext,
  VerifyResult,
} from "./approval-evidence.js";

export type DeviceKeyPair = {
  publicKeyPem: string;
  privateKeyPem: string;
  createdAt: string;
};

export type TrustStore = {
  trustedPublicKeys: ReadonlySet<string>;
  revokedPublicKeys: ReadonlySet<string>;
};

export type CryptoVerifyContext = VerifyContext & {
  trust?: TrustStore;
};

export type UnsignedApprovalEvidence = Omit<SignedApprovalEvidence, "signature" | "signerPublicKey">;

export interface ApprovalSigner {
  publicKeyPem: string;
  sign(unsigned: UnsignedApprovalEvidence): SignedApprovalEvidence;
}

/** Canonical JSON for stable hashing / signing (sorted keys, no whitespace). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return value;
}

function signingPayload(unsigned: UnsignedApprovalEvidence): Buffer {
  return Buffer.from(
    canonicalJson({
      roomIncarnation: unsigned.roomIncarnation,
      runnerEpoch: unsigned.runnerEpoch,
      requestNonce: unsigned.requestNonce,
      evidenceDigest: unsigned.evidenceDigest,
      decision: unsigned.decision,
      expiresAt: unsigned.expiresAt,
      membershipVersion: unsigned.membershipVersion,
      capabilityGrant: unsigned.capabilityGrant,
    }),
    "utf8",
  );
}

/** Real SHA-256 digester over canonical evidence material. */
export class Sha256EvidenceDigester implements EvidenceDigester {
  digest(material: EvidenceMaterial): ApprovalEvidenceDigest {
    const hex = createHash("sha256").update(canonicalJson(material), "utf8").digest("hex");
    return { algorithm: "sha256", hex };
  }
}

export function generateDeviceKeyPair(nowIso = new Date().toISOString()): DeviceKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    createdAt: nowIso,
  };
}

export class Ed25519ApprovalSigner implements ApprovalSigner {
  readonly publicKeyPem: string;
  readonly #privateKeyPem: string;

  constructor(pair: DeviceKeyPair) {
    this.publicKeyPem = pair.publicKeyPem;
    this.#privateKeyPem = pair.privateKeyPem;
  }

  static generate(nowIso?: string): Ed25519ApprovalSigner {
    return new Ed25519ApprovalSigner(generateDeviceKeyPair(nowIso));
  }

  sign(unsigned: UnsignedApprovalEvidence): SignedApprovalEvidence {
    const key = createPrivateKey(this.#privateKeyPem);
    const signature = sign(null, signingPayload(unsigned), key).toString("base64url");
    return {
      ...unsigned,
      signerPublicKey: this.publicKeyPem,
      signature,
    };
  }
}

export class Ed25519ApprovalVerifier implements ApprovalVerifier {
  verify(evidence: SignedApprovalEvidence, context: VerifyContext | CryptoVerifyContext): VerifyResult {
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

    const trust = "trust" in context ? context.trust : undefined;
    if (trust) {
      if (trust.revokedPublicKeys.has(evidence.signerPublicKey)) {
        return { ok: false, reason: "revoked_signer" };
      }
      if (!trust.trustedPublicKeys.has(evidence.signerPublicKey)) {
        return { ok: false, reason: "unknown_signer" };
      }
    }

    try {
      const key = createPublicKey(evidence.signerPublicKey);
      const unsigned: UnsignedApprovalEvidence = {
        roomIncarnation: evidence.roomIncarnation,
        runnerEpoch: evidence.runnerEpoch,
        requestNonce: evidence.requestNonce,
        evidenceDigest: evidence.evidenceDigest,
        decision: evidence.decision,
        expiresAt: evidence.expiresAt,
        membershipVersion: evidence.membershipVersion,
        capabilityGrant: evidence.capabilityGrant,
      };
      const ok = verify(null, signingPayload(unsigned), key, Buffer.from(evidence.signature, "base64url"));
      return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
    } catch {
      return { ok: false, reason: "bad_signature" };
    }
  }
}

/** In-memory device enrollment / rotation / revocation store for local policy. */
export class DeviceTrustStore {
  readonly #trusted = new Map<string, { memberId: string; enrolledAt: string }>();
  readonly #revoked = new Set<string>();

  enroll(publicKeyPem: string, memberId: string, enrolledAt: string): void {
    if (this.#revoked.has(publicKeyPem)) {
      this.#revoked.delete(publicKeyPem);
    }
    this.#trusted.set(publicKeyPem, { memberId, enrolledAt });
  }

  revoke(publicKeyPem: string): void {
    this.#trusted.delete(publicKeyPem);
    this.#revoked.add(publicKeyPem);
  }

  rotate(oldPublicKeyPem: string, newPublicKeyPem: string, memberId: string, nowIso: string): void {
    this.revoke(oldPublicKeyPem);
    this.enroll(newPublicKeyPem, memberId, nowIso);
  }

  snapshot(): TrustStore {
    return {
      trustedPublicKeys: new Set(this.#trusted.keys()),
      revokedPublicKeys: new Set(this.#revoked),
    };
  }

  isTrusted(publicKeyPem: string): boolean {
    return this.#trusted.has(publicKeyPem) && !this.#revoked.has(publicKeyPem);
  }
}

export function buildUnsignedEvidence(input: {
  roomIncarnation: string;
  runnerEpoch: number;
  requestNonce: string;
  evidenceDigest: ApprovalEvidenceDigest;
  decision: ApprovalDecision;
  expiresAt: string;
  membershipVersion: number;
  capabilityGrant: ApprovalCapabilityGrant;
}): UnsignedApprovalEvidence {
  return { ...input };
}
