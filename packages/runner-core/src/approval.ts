import {
  StubApprovalVerifier,
  StubEvidenceDigester,
  type ApprovalDecision,
  type ApprovalVerifier,
  type EvidenceDigester,
  type EvidenceMaterial,
  type SignedApprovalEvidence,
  type VerifyContext,
  type VerifyResult,
} from "@huddle/authz";
import { createHuddleError, type HuddleError } from "@huddle/protocol";
import type { RunnerFence } from "./epoch.js";
import { assertRunnerEpoch } from "./epoch.js";

export type ApprovalGateDeps = {
  digester?: EvidenceDigester;
  verifier?: ApprovalVerifier;
};

export type ApprovalGateInput = {
  fence: RunnerFence;
  expectedFence: RunnerFence;
  evidence: SignedApprovalEvidence;
  material: EvidenceMaterial;
  expectedNonce: string;
  nowIso: string;
  consumedNonces: ReadonlySet<string>;
};

export type ApprovalGateResult =
  | { ok: true; decision: ApprovalDecision; digestHex: string }
  | { ok: false; error: HuddleError; verify?: VerifyResult };

/**
 * Local approval evidence verification hooks (AC-6).
 * Always calls into `@huddle/authz` verifier interfaces; default stubs fail closed
 * on cryptographic signature verification.
 */
export function verifyApprovalEvidence(
  input: ApprovalGateInput,
  deps: ApprovalGateDeps = {},
): ApprovalGateResult {
  const epoch = assertRunnerEpoch(input.expectedFence, input.fence, "approval-epoch");
  if (!epoch.ok) {
    return { ok: false, error: epoch.error };
  }

  const digester = deps.digester ?? new StubEvidenceDigester();
  const verifier = deps.verifier ?? new StubApprovalVerifier();
  const digest = digester.digest(input.material);

  const context: VerifyContext = {
    roomIncarnation: input.expectedFence.roomIncarnation,
    runnerEpoch: input.expectedFence.runnerEpoch,
    expectedNonce: input.expectedNonce,
    expectedDigest: digest,
    nowIso: input.nowIso,
    consumedNonces: input.consumedNonces,
  };

  const result = verifier.verify(input.evidence, context);
  if (!result.ok) {
    const code =
      result.reason === "stale_epoch"
        ? "RUNNER_EPOCH_STALE"
        : result.reason === "unsupported"
          ? "AUTHZ_APPROVAL_UNSUPPORTED"
          : result.reason === "expired" || result.reason === "nonce_replay"
            ? "AUTHZ_APPROVAL_STALE"
            : "AUTHZ_PERMISSION_DENIED";

    return {
      ok: false,
      verify: result,
      error: createHuddleError({
        code,
        message: `Approval evidence rejected (${result.reason}). Re-request approval with current room fencing.`,
        retryable: false,
        diagnosticId: `approval-${input.expectedNonce}`,
      }),
    };
  }

  return {
    ok: true,
    decision: input.evidence.decision,
    digestHex: digest.hex,
  };
}
