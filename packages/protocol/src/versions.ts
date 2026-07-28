/** Current Huddle protocol schema version. Additive changes bump this. */
export const PROTOCOL_SCHEMA_VERSION = 1;

/** Compatibility window: readers must support current and previous. */
export const PROTOCOL_COMPATIBILITY = {
  current: PROTOCOL_SCHEMA_VERSION,
  previous: PROTOCOL_SCHEMA_VERSION,
  min: PROTOCOL_SCHEMA_VERSION,
  max: PROTOCOL_SCHEMA_VERSION,
} as const;

export const ROOM_EVENT_TYPES = [
  "room.created",
  "room.policy_updated",
  "room.host_connected",
  "room.host_disconnected",
  "room.archived",
  "member.joined",
  "member.left",
  "member.role_updated",
  "member.removed",
  "driver.requested",
  "driver.changed",
  "input.commented",
  "input.suggested",
  "input.accepted",
  "input.rejected",
  "input.queued",
  "input.steered",
  "effect.accepted",
  "effect.dispatched",
  "effect.runner_durable",
  "effect.provider_submitted",
  "effect.applied",
  "effect.rejected",
  "effect.unknown",
  "run.starting",
  "run.started",
  "run.awaiting_approval",
  "run.interrupted",
  "run.failed",
  "run.completed",
  "agent.message_delta",
  "agent.message_completed",
  "agent.plan_updated",
  "agent.tool_started",
  "agent.tool_updated",
  "agent.tool_completed",
  "agent.command_started",
  "agent.command_output",
  "agent.command_completed",
  "agent.diff_updated",
  "approval.requested",
  "approval.commented",
  "approval.resolved",
] as const;

export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];

export const ACTOR_TYPES = ["member", "agent", "runner", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const PROVIDERS = ["codex", "opencode", "claude", "acp"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const VISIBILITIES = ["room", "approvers", "owner"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
