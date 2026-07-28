import { createHuddleError, type HuddleError } from "../errors/codes.js";
import { PROTOCOL_COMPATIBILITY } from "../versions.js";

export type ProtocolCapability =
  | "room_events_v1"
  | "driver_lease_v1"
  | "approvals_v1"
  | "effect_lifecycle_v1"
  | "steering"
  | "remote_approvals";

export const REQUIRED_CAPABILITIES = [
  "room_events_v1",
  "driver_lease_v1",
  "approvals_v1",
  "effect_lifecycle_v1",
] as const satisfies readonly ProtocolCapability[];

export type CompatibilityOffer = {
  minProtocol: number;
  maxProtocol: number;
  requiredCapabilities: readonly ProtocolCapability[];
  optionalCapabilities?: readonly ProtocolCapability[];
  /** Minimum reader version keyed by durable event type (optional map). */
  minReaderVersionByEventType?: Readonly<Record<string, number>>;
  /** Codex App Server version string when known. */
  codexAppServerVersion?: string;
  /** Generated provider schema fingerprint when known. */
  schemaFingerprint?: string;
};

export type CompatibilityMode = "full" | "observation_only";

export type CompatibilitySuccess = {
  ok: true;
  mode: CompatibilityMode;
  negotiatedProtocol: number;
  missingOptional: ProtocolCapability[];
};

export type CompatibilityFailure = {
  ok: false;
  error: HuddleError;
};

export type CompatibilityResult = CompatibilitySuccess | CompatibilityFailure;

export function defaultLocalOffer(
  overrides: Partial<CompatibilityOffer> = {},
): CompatibilityOffer {
  return {
    minProtocol: PROTOCOL_COMPATIBILITY.min,
    maxProtocol: PROTOCOL_COMPATIBILITY.max,
    requiredCapabilities: [...REQUIRED_CAPABILITIES],
    optionalCapabilities: ["steering", "remote_approvals"],
    ...overrides,
  };
}

/**
 * Negotiate browser/server/runner protocol versions and capabilities (§48).
 * Unsupported required execution semantics force observation-only when protocol
 * versions overlap but required caps are missing on the peer for execution.
 */
export function negotiateCompatibility(
  local: CompatibilityOffer,
  peer: CompatibilityOffer,
  diagnosticId: string,
): CompatibilityResult {
  const negotiated = Math.min(local.maxProtocol, peer.maxProtocol);
  const floor = Math.max(local.minProtocol, peer.minProtocol);

  if (negotiated < floor) {
    return {
      ok: false,
      error: createHuddleError({
        code: "PROTOCOL_INCOMPATIBLE",
        message:
          "Protocol versions do not overlap. Upgrade the runner or control plane, then retry.",
        retryable: false,
        diagnosticId,
      }),
    };
  }

  const peerCaps = new Set(peer.requiredCapabilities);
  const localOptional = new Set(local.optionalCapabilities ?? []);
  const missingRequired = local.requiredCapabilities.filter((cap) => !peerCaps.has(cap));

  // Peer must also accept our required set; if peer advertises a stricter required
  // set we cannot satisfy, fall back to observation-only when versions overlap.
  const localCaps = new Set([
    ...local.requiredCapabilities,
    ...(local.optionalCapabilities ?? []),
  ]);
  const unsatisfiedPeerRequired = peer.requiredCapabilities.filter((cap) => !localCaps.has(cap));

  if (missingRequired.length > 0 || unsatisfiedPeerRequired.length > 0) {
    return {
      ok: true,
      mode: "observation_only",
      negotiatedProtocol: negotiated,
      missingOptional: [],
    };
  }

  const peerAll = new Set([
    ...peer.requiredCapabilities,
    ...(peer.optionalCapabilities ?? []),
  ]);
  const missingOptional = [...localOptional].filter((cap) => !peerAll.has(cap));

  return {
    ok: true,
    mode: "full",
    negotiatedProtocol: negotiated,
    missingOptional,
  };
}
