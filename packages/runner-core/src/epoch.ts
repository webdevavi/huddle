import { createHuddleError, type HuddleError } from "@huddle/protocol";

export type RunnerFence = {
  roomIncarnation: string;
  runnerEpoch: number;
};

export type EpochCheckResult =
  | { ok: true }
  | { ok: false; error: HuddleError };

/**
 * Reject stale runner epochs. A replaced runner must not accept, execute,
 * acknowledge, or ingest (§46 / ENG-T3).
 */
export function assertRunnerEpoch(
  expected: RunnerFence,
  actual: RunnerFence,
  diagnosticId: string,
): EpochCheckResult {
  if (actual.roomIncarnation !== expected.roomIncarnation) {
    return {
      ok: false,
      error: createHuddleError({
        code: "RUNNER_EPOCH_STALE",
        message:
          "Room incarnation mismatch. This runner is no longer authoritative; reconnect or resume the room.",
        retryable: false,
        diagnosticId,
      }),
    };
  }
  if (actual.runnerEpoch !== expected.runnerEpoch) {
    return {
      ok: false,
      error: createHuddleError({
        code: "RUNNER_EPOCH_STALE",
        message:
          "Runner epoch is stale. Another runner took over this room; stop execution and discard pending effects.",
        retryable: false,
        diagnosticId,
      }),
    };
  }
  return { ok: true };
}

export function isStaleEpoch(expected: RunnerFence, actual: RunnerFence): boolean {
  return !assertRunnerEpoch(expected, actual, "epoch-check").ok;
}
