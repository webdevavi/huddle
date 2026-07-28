import { allow, rejectInvalid, rejectTerminal, type TransitionResult } from "./result.js";

/**
 * Mutation/effect lifecycle (§11.3 / §46).
 * Terminal outcomes: applied | rejected | cancelled | expired | unknown
 */
export const EFFECT_STATUSES = [
  "received",
  "authorized",
  "durable",
  "dispatched",
  "runner_durable",
  "provider_submitted",
  "applied",
  "rejected",
  "cancelled",
  "expired",
  "unknown",
] as const;

export type EffectStatus = (typeof EFFECT_STATUSES)[number];

const TERMINAL: ReadonlySet<EffectStatus> = new Set([
  "applied",
  "rejected",
  "cancelled",
  "expired",
  "unknown",
]);

const FORWARD: ReadonlyMap<EffectStatus, ReadonlySet<EffectStatus>> = new Map<
  EffectStatus,
  ReadonlySet<EffectStatus>
>([
  ["received", new Set(["authorized", "rejected", "cancelled", "expired"])],
  ["authorized", new Set(["durable", "rejected", "cancelled", "expired"])],
  ["durable", new Set(["dispatched", "rejected", "cancelled", "expired"])],
  ["dispatched", new Set(["runner_durable", "rejected", "cancelled", "expired", "unknown"])],
  [
    "runner_durable",
    new Set(["provider_submitted", "rejected", "cancelled", "expired", "unknown"]),
  ],
  [
    "provider_submitted",
    new Set(["applied", "rejected", "cancelled", "expired", "unknown"]),
  ],
]);

export function isEffectTerminal(status: EffectStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionEffect(from: EffectStatus, to: EffectStatus): boolean {
  if (from === to) return true;
  if (isEffectTerminal(from)) return false;
  return FORWARD.get(from)?.has(to) ?? false;
}

export function transitionEffect(
  from: EffectStatus,
  to: EffectStatus,
): TransitionResult<EffectStatus> {
  if (from === to) {
    return allow(from, false);
  }
  if (isEffectTerminal(from)) {
    return rejectTerminal(from);
  }
  if (!canTransitionEffect(from, to)) {
    return rejectInvalid(from);
  }
  return allow(to);
}
