#!/usr/bin/env node
/**
 * Content-free synthetic Phase-1 funnel + scorecard (CEO-T5).
 * Human 10-pair recruitment is out of band — this verifies instrumentation only.
 */

const FUNNEL = [];

function emit(event) {
  FUNNEL.push(event);
}

function scorePhaseGate(input) {
  const reasons = [];
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
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const repeatRoomRate =
    input.roomsCompleted === 0 ? 0 : input.repeatRoomsWithin14d / input.roomsCompleted;

  if (input.pairsCompleted < 10) reasons.push(`pairsCompleted ${input.pairsCompleted} < 10`);
  if (input.meaningfulInterventions < 6) {
    reasons.push(`meaningfulInterventions ${input.meaningfulInterventions} < 6`);
  }
  if (input.wouldUseAgain < 5) reasons.push(`wouldUseAgain ${input.wouldUseAgain} < 5`);

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

const now = () => new Date().toISOString();
const roomKey = "synthetic-room-1";

for (const step of [
  { name: "cli_invoked" },
  { name: "preflight_passed" },
  { name: "auth_started" },
  { name: "auth_completed" },
  { name: "room_requested", roomKey },
  { name: "runner_ready", roomKey },
  { name: "share_url_displayed", roomKey },
  { name: "invite_opened", roomKey },
  { name: "join_completed", roomKey, latencyMs: 1400 },
  { name: "second_participant_visible", roomKey },
  { name: "intervention_submitted", roomKey, interventionKind: "suggestion" },
  { name: "intervention_applied", roomKey, interventionKind: "suggestion", latencyMs: 2200 },
  { name: "intervention_terminal", roomKey, interventionKind: "suggestion" },
  { name: "room_completed", roomKey },
  { name: "room_archived", roomKey },
]) {
  emit({
    name: step.name,
    ts: now(),
    roomKey: step.roomKey,
    latencyMs: step.latencyMs,
    interventionKind: step.interventionKind,
  });
}

const applied = FUNNEL.filter((e) => e.name === "intervention_applied");
const score = scorePhaseGate({
  pairsCompleted: 0,
  meaningfulInterventions: applied.length,
  wouldUseAgain: 0,
  roomsWithInviteOpened: FUNNEL.filter((e) => e.name === "invite_opened").length,
  roomsWithJoinCompleted: FUNNEL.filter((e) => e.name === "join_completed").length,
  twoPersonRooms: FUNNEL.filter((e) => e.name === "second_participant_visible").length,
  interventionLatenciesMs: applied.map((e) => e.latencyMs).filter((n) => typeof n === "number"),
  roomsCompleted: FUNNEL.filter((e) => e.name === "room_completed").length,
  repeatRoomsWithin14d: 0,
});

const report = {
  ok: true,
  synthetic: true,
  events: FUNNEL.map((e) => ({
    name: e.name,
    roomKey: e.roomKey ?? null,
    latencyMs: e.latencyMs ?? null,
    interventionKind: e.interventionKind ?? null,
  })),
  scorecard: score,
  note: "Human Phase-1 gate (10 pairs / 6 interventions / 5 would-use-again) is not claimed by this synthetic run.",
};

console.log(JSON.stringify(report, null, 2));
