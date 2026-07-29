/**
 * Content-free funnel analytics (CEO-T5 / DX-T10).
 * Never record repository names, paths, prompts, commands, diffs, or room content.
 */

export const FUNNEL_EVENTS = [
  "cli_invoked",
  "preflight_passed",
  "preflight_failed",
  "auth_started",
  "auth_completed",
  "auth_cancelled",
  "room_requested",
  "runner_ready",
  "share_url_displayed",
  "invite_opened",
  "join_completed",
  "second_participant_visible",
  "intervention_submitted",
  "intervention_applied",
  "intervention_terminal",
  "room_completed",
  "room_archived",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export type FunnelEvent = {
  name: FunnelEventName;
  ts: string;
  /** Opaque room id hash or synthetic id — never a slug/path. */
  roomKey?: string;
  /** Error code only (e.g. HUDDLE-PREFLIGHT-001). */
  errorCode?: string;
  /** Latency in ms for intervention_applied / join_completed. */
  latencyMs?: number;
  /** Intervention class without content. */
  interventionKind?: "suggestion" | "handoff" | "approval";
};

export type FunnelSink = {
  emit(event: FunnelEvent): void;
};

export class MemoryFunnelSink implements FunnelSink {
  readonly events: FunnelEvent[] = [];
  emit(event: FunnelEvent): void {
    this.events.push(event);
  }
}

/** No-op sink — self-host default when HUDDLE_TELEMETRY=off. */
export class NullFunnelSink implements FunnelSink {
  emit(_event: FunnelEvent): void {
    // intentionally empty
  }
}

export function createFunnelSink(options: {
  enabled?: boolean;
  memory?: boolean;
} = {}): FunnelSink {
  if (options.memory) return new MemoryFunnelSink();
  if (options.enabled === false) return new NullFunnelSink();
  const telemetry = process.env.HUDDLE_TELEMETRY?.trim().toLowerCase();
  if (telemetry === "off" || telemetry === "0" || telemetry === "false" || !telemetry) {
    return new NullFunnelSink();
  }
  return new MemoryFunnelSink();
}

export type PhaseGateScores = {
  pairsCompleted: number;
  meaningfulInterventions: number;
  wouldUseAgain: number;
  inviteJoinActivation: number;
  interventionRate: number;
  medianInterventionLatencyMs: number | null;
  repeatRoomRate: number;
  gatePassed: boolean;
  reasons: string[];
};

/**
 * Score a Phase-1 product gate from content-free funnel + survey counts.
 * Thresholds mirror the approved spec (10 pairs / 6 interventions / 5 would-use-again).
 */
export function scorePhaseGate(input: {
  pairsCompleted: number;
  meaningfulInterventions: number;
  wouldUseAgain: number;
  roomsWithInviteOpened: number;
  roomsWithJoinCompleted: number;
  twoPersonRooms: number;
  interventionLatenciesMs: number[];
  roomsCompleted: number;
  repeatRoomsWithin14d: number;
}): PhaseGateScores {
  const reasons: string[] = [];
  const inviteJoinActivation =
    input.roomsWithInviteOpened === 0
      ? 0
      : input.roomsWithJoinCompleted / input.roomsWithInviteOpened;
  const interventionRate =
    input.twoPersonRooms === 0 ? 0 : input.meaningfulInterventions / input.twoPersonRooms;
  const sorted = [...input.interventionLatenciesMs].sort((a, b) => a - b);
  const medianInterventionLatencyMs =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const repeatRoomRate =
    input.roomsCompleted === 0 ? 0 : input.repeatRoomsWithin14d / input.roomsCompleted;

  if (input.pairsCompleted < 10) {
    reasons.push(`pairsCompleted ${input.pairsCompleted} < 10`);
  }
  if (input.meaningfulInterventions < 6) {
    reasons.push(`meaningfulInterventions ${input.meaningfulInterventions} < 6`);
  }
  if (input.wouldUseAgain < 5) {
    reasons.push(`wouldUseAgain ${input.wouldUseAgain} < 5`);
  }

  return {
    pairsCompleted: input.pairsCompleted,
    meaningfulInterventions: input.meaningfulInterventions,
    wouldUseAgain: input.wouldUseAgain,
    inviteJoinActivation,
    interventionRate,
    medianInterventionLatencyMs,
    repeatRoomRate,
    gatePassed: reasons.length === 0,
    reasons,
  };
}
