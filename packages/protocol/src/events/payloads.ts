import { z } from "zod";
import { ROOM_EVENT_TYPES, type RoomEventType } from "../versions.js";

/** Minimal shared fields used by many payloads. */
const emptyPayload = z.object({}).strict();

const memberRef = z.object({
  memberId: z.string().min(1),
});

const roleSchema = z.enum(["viewer", "collaborator", "owner"]);

const effectStatusSchema = z.enum([
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
]);

const approvalDecisionSchema = z.enum(["allow", "deny", "cancel"]);

/**
 * Minimal required payloads per §11.2 event type.
 * Additive fields may be introduced in later schema versions.
 */
export const roomEventPayloadSchemas = {
  "room.created": z
    .object({
      slug: z.string().min(1),
      name: z.string().min(1).optional(),
    })
    .strict(),
  "room.policy_updated": z
    .object({
      policyVersion: z.number().int().nonnegative(),
    })
    .strict(),
  "room.host_connected": emptyPayload,
  "room.host_disconnected": emptyPayload,
  "room.archived": emptyPayload,

  "member.joined": z
    .object({
      memberId: z.string().min(1),
      role: roleSchema,
      displayName: z.string().optional(),
    })
    .strict(),
  "member.left": memberRef.strict(),
  "member.role_updated": z
    .object({
      memberId: z.string().min(1),
      role: roleSchema,
    })
    .strict(),
  "member.removed": memberRef.strict(),

  "driver.requested": z
    .object({
      memberId: z.string().min(1),
      expectedLeaseVersion: z.number().int().nonnegative().optional(),
    })
    .strict(),
  "driver.changed": z
    .object({
      memberId: z.string().min(1).nullable(),
      leaseVersion: z.number().int().nonnegative(),
    })
    .strict(),

  "input.commented": z
    .object({
      text: z.string(),
    })
    .strict(),
  "input.suggested": z
    .object({
      suggestionId: z.string().min(1),
      text: z.string(),
    })
    .strict(),
  "input.accepted": z
    .object({
      suggestionId: z.string().min(1),
    })
    .strict(),
  "input.rejected": z
    .object({
      suggestionId: z.string().min(1),
      reason: z.string().optional(),
    })
    .strict(),
  "input.queued": z
    .object({
      inputId: z.string().min(1),
      text: z.string(),
    })
    .strict(),
  "input.steered": z
    .object({
      inputId: z.string().min(1),
      text: z.string(),
      turnId: z.string().min(1).optional(),
    })
    .strict(),

  "effect.accepted": z
    .object({
      mutationId: z.string().min(1),
      status: effectStatusSchema,
    })
    .strict(),
  "effect.dispatched": z
    .object({
      mutationId: z.string().min(1),
      status: effectStatusSchema,
    })
    .strict(),
  "effect.runner_durable": z
    .object({
      mutationId: z.string().min(1),
      status: effectStatusSchema,
    })
    .strict(),
  "effect.provider_submitted": z
    .object({
      mutationId: z.string().min(1),
      status: effectStatusSchema,
    })
    .strict(),
  "effect.applied": z
    .object({
      mutationId: z.string().min(1),
      status: effectStatusSchema,
    })
    .strict(),
  "effect.rejected": z
    .object({
      mutationId: z.string().min(1),
      status: effectStatusSchema,
      reason: z.string().optional(),
    })
    .strict(),
  "effect.unknown": z
    .object({
      mutationId: z.string().min(1),
      status: z.literal("unknown"),
    })
    .strict(),

  "run.starting": emptyPayload,
  "run.started": emptyPayload,
  "run.awaiting_approval": z
    .object({
      approvalId: z.string().min(1),
    })
    .strict(),
  "run.interrupted": emptyPayload,
  "run.failed": z
    .object({
      reason: z.string().optional(),
    })
    .strict(),
  "run.completed": emptyPayload,

  "agent.message_delta": z
    .object({
      messageId: z.string().min(1),
      delta: z.string(),
    })
    .strict(),
  "agent.message_completed": z
    .object({
      messageId: z.string().min(1),
      text: z.string(),
    })
    .strict(),
  "agent.plan_updated": z
    .object({
      planId: z.string().min(1),
      summary: z.string(),
    })
    .strict(),
  "agent.tool_started": z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
    })
    .strict(),
  "agent.tool_updated": z
    .object({
      toolCallId: z.string().min(1),
      status: z.string().min(1),
    })
    .strict(),
  "agent.tool_completed": z
    .object({
      toolCallId: z.string().min(1),
      status: z.string().min(1),
    })
    .strict(),
  "agent.command_started": z
    .object({
      commandId: z.string().min(1),
      command: z.string().min(1),
    })
    .strict(),
  "agent.command_output": z
    .object({
      commandId: z.string().min(1),
      chunk: z.string(),
      truncated: z.boolean().optional(),
    })
    .strict(),
  "agent.command_completed": z
    .object({
      commandId: z.string().min(1),
      exitCode: z.number().int().optional(),
    })
    .strict(),
  "agent.diff_updated": z
    .object({
      diffId: z.string().min(1),
      summary: z.string(),
    })
    .strict(),

  "approval.requested": z
    .object({
      approvalId: z.string().min(1),
      category: z.string().min(1),
      evidenceDigest: z.string().min(1),
      requestNonce: z.string().min(1),
    })
    .strict(),
  "approval.commented": z
    .object({
      approvalId: z.string().min(1),
      text: z.string(),
    })
    .strict(),
  "approval.resolved": z
    .object({
      approvalId: z.string().min(1),
      decision: approvalDecisionSchema,
      evidenceDigest: z.string().min(1),
    })
    .strict(),
} as const satisfies Record<RoomEventType, z.ZodTypeAny>;

export type RoomEventPayloads = {
  [K in RoomEventType]: z.infer<(typeof roomEventPayloadSchemas)[K]>;
};

export function payloadSchemaFor(type: RoomEventType): z.ZodTypeAny {
  return roomEventPayloadSchemas[type];
}

export const knownRoomEventTypeSchema = z.enum(ROOM_EVENT_TYPES);
