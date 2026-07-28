import { z } from "zod";
import {
  ACTOR_TYPES,
  PROTOCOL_SCHEMA_VERSION,
  PROVIDERS,
  ROOM_EVENT_TYPES,
  VISIBILITIES,
  type RoomEventType,
} from "../versions.js";
import {
  knownRoomEventTypeSchema,
  roomEventPayloadSchemas,
  type RoomEventPayloads,
} from "./payloads.js";

export type RoomEventActor = {
  type: (typeof ACTOR_TYPES)[number];
  id: string;
  displayName?: string;
};

export type RoomEvent<K extends RoomEventType = RoomEventType> = {
  schemaVersion: number;
  eventId: string;
  roomId: string;
  roomIncarnation: string;
  runnerEpoch?: number;
  sequence: number;
  timestamp: string;
  actor: RoomEventActor;
  provider?: (typeof PROVIDERS)[number];
  type: K;
  payload: RoomEventPayloads[K];
  causationId?: string;
  correlationId?: string;
  nativeIds?: Record<string, string>;
  visibility: (typeof VISIBILITIES)[number];
};

const actorSchema = z
  .object({
    type: z.enum(ACTOR_TYPES),
    id: z.string().min(1),
    displayName: z.string().optional(),
  })
  .strict();

const envelopeBaseSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    eventId: z.string().min(1),
    roomId: z.string().min(1),
    roomIncarnation: z.string().min(1),
    runnerEpoch: z.number().int().nonnegative().optional(),
    sequence: z.number().int().nonnegative(),
    timestamp: z.string().min(1),
    actor: actorSchema,
    provider: z.enum(PROVIDERS).optional(),
    type: z.string().min(1),
    payload: z.unknown(),
    causationId: z.string().min(1).optional(),
    correlationId: z.string().min(1).optional(),
    nativeIds: z.record(z.string()).optional(),
    visibility: z.enum(VISIBILITIES),
  })
  .strict();

export type ParseRoomEventSuccess = {
  ok: true;
  event: RoomEvent;
  known: true;
};

export type ParseRoomEventUnknown = {
  ok: true;
  event: z.infer<typeof envelopeBaseSchema>;
  known: false;
};

export type ParseRoomEventFailure = {
  ok: false;
  error: z.ZodError;
};

export type ParseRoomEventResult =
  | ParseRoomEventSuccess
  | ParseRoomEventUnknown
  | ParseRoomEventFailure;

/**
 * Parse a durable room event.
 * Unknown event types are retained (store-and-skip) when the envelope is valid;
 * they are never coerced into a known type.
 */
export function parseRoomEvent(input: unknown): ParseRoomEventResult {
  const envelope = envelopeBaseSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, error: envelope.error };
  }

  const typeCheck = knownRoomEventTypeSchema.safeParse(envelope.data.type);
  if (!typeCheck.success) {
    return { ok: true, event: envelope.data, known: false };
  }

  const type = typeCheck.data;
  const payloadResult = roomEventPayloadSchemas[type].safeParse(envelope.data.payload);
  if (!payloadResult.success) {
    return { ok: false, error: payloadResult.error };
  }

  const event = {
    ...envelope.data,
    type,
    payload: payloadResult.data,
  } as RoomEvent;

  return { ok: true, event, known: true };
}

export function isKnownRoomEventType(type: string): type is RoomEventType {
  return (ROOM_EVENT_TYPES as readonly string[]).includes(type);
}

export function createRoomEventEnvelope<K extends RoomEventType>(
  partial: Omit<RoomEvent<K>, "schemaVersion"> & { schemaVersion?: number },
): RoomEvent<K> {
  return {
    schemaVersion: partial.schemaVersion ?? PROTOCOL_SCHEMA_VERSION,
    ...partial,
  } as RoomEvent<K>;
}
