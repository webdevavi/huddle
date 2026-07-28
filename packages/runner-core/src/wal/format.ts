/**
 * Segmented framed WAL encoding (§47).
 *
 * Frame layout:
 *   magic[4] = "HWAL"
 *   length u32 BE  — bytes after length field through payload (version+type+payload)
 *   version u16 BE
 *   type u8 — 1=header, 2=record, 3=checkpoint
 *   payload[length-3]
 *   crc32 u32 BE — over version|type|payload
 */

export const WAL_MAGIC = Buffer.from("HWAL");
export const WAL_VERSION = 1;
export const WAL_PREVIOUS_VERSION = 1;

export const FRAME_HEADER = 1;
export const FRAME_RECORD = 2;
export const FRAME_CHECKPOINT = 3;

export type WalRecordType =
  | "mutation_intent"
  | "effect"
  | "provider_event"
  | "approval_intent"
  | "approval_ack"
  | "heartbeat"
  | "sync_ack";

export type WalHeaderPayload = {
  roomIncarnation: string;
  runnerEpoch: number;
};

export type WalRecordPayload = {
  recordId: string;
  recordType: WalRecordType;
  roomIncarnation: string;
  runnerEpoch: number;
  body: unknown;
};

export type WalCheckpointPayload = {
  lastDurableRecordId: string | null;
  lastServerAckId: string | null;
  segmentName: string;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeJsonPayload(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

export function encodeFrame(type: number, version: number, payload: Buffer): Buffer {
  const body = Buffer.alloc(2 + 1 + payload.length);
  body.writeUInt16BE(version, 0);
  body.writeUInt8(type, 2);
  payload.copy(body, 3);
  const checksum = crc32(body);
  const frame = Buffer.alloc(4 + 4 + body.length + 4);
  WAL_MAGIC.copy(frame, 0);
  frame.writeUInt32BE(body.length, 4);
  body.copy(frame, 8);
  frame.writeUInt32BE(checksum, 8 + body.length);
  return frame;
}

export function encodeHeaderFrame(header: WalHeaderPayload, version = WAL_VERSION): Buffer {
  return encodeFrame(FRAME_HEADER, version, encodeJsonPayload(header));
}

export function encodeRecordFrame(record: WalRecordPayload, version = WAL_VERSION): Buffer {
  return encodeFrame(FRAME_RECORD, version, encodeJsonPayload(record));
}

export function encodeCheckpointFrame(
  checkpoint: WalCheckpointPayload,
  version = WAL_VERSION,
): Buffer {
  return encodeFrame(FRAME_CHECKPOINT, version, encodeJsonPayload(checkpoint));
}

export type DecodedFrame =
  | { type: "header"; version: number; payload: WalHeaderPayload; bytes: number }
  | { type: "record"; version: number; payload: WalRecordPayload; bytes: number }
  | { type: "checkpoint"; version: number; payload: WalCheckpointPayload; bytes: number };

export type DecodeResult =
  | { ok: true; frame: DecodedFrame }
  | {
      ok: false;
      reason: "incomplete" | "bad_magic" | "bad_crc" | "bad_payload" | "unsupported_version";
      consumed?: number;
    };

export function tryDecodeFrame(buffer: Buffer): DecodeResult {
  if (buffer.length < 12) return { ok: false, reason: "incomplete" };
  if (!buffer.subarray(0, 4).equals(WAL_MAGIC)) {
    return { ok: false, reason: "bad_magic", consumed: 0 };
  }
  const bodyLength = buffer.readUInt32BE(4);
  const total = 4 + 4 + bodyLength + 4;
  if (buffer.length < total) return { ok: false, reason: "incomplete" };
  const body = buffer.subarray(8, 8 + bodyLength);
  const expectedCrc = buffer.readUInt32BE(8 + bodyLength);
  if (expectedCrc !== crc32(body)) return { ok: false, reason: "bad_crc", consumed: 0 };
  const version = body.readUInt16BE(0);
  if (version !== WAL_VERSION && version !== WAL_PREVIOUS_VERSION) {
    return { ok: false, reason: "unsupported_version", consumed: total };
  }
  const type = body.readUInt8(2);
  const payloadBuf = body.subarray(3);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload", consumed: 0 };
  }
  if (type === FRAME_HEADER) {
    return { ok: true, frame: { type: "header", version, payload: parsed as WalHeaderPayload, bytes: total } };
  }
  if (type === FRAME_RECORD) {
    return { ok: true, frame: { type: "record", version, payload: parsed as WalRecordPayload, bytes: total } };
  }
  if (type === FRAME_CHECKPOINT) {
    return {
      ok: true,
      frame: { type: "checkpoint", version, payload: parsed as WalCheckpointPayload, bytes: total },
    };
  }
  return { ok: false, reason: "bad_payload", consumed: 0 };
}

export function recoverSegment(
  buffer: Buffer,
  options: { failClosedOnMidCorruption?: boolean } = {},
): { frames: DecodedFrame[]; truncatedBytes: number; failClosed: boolean } {
  const frames: DecodedFrame[] = [];
  let offset = 0;
  let failClosed = false;

  while (offset < buffer.length) {
    const result = tryDecodeFrame(buffer.subarray(offset));
    if (result.ok) {
      frames.push(result.frame);
      offset += result.frame.bytes;
      continue;
    }
    if (result.reason === "incomplete") {
      return { frames, truncatedBytes: buffer.length - offset, failClosed };
    }
    if (options.failClosedOnMidCorruption && frames.length > 0) {
      const remainder = buffer.subarray(offset);
      const looksLikeFrame =
        remainder.length >= 4 &&
        (remainder.subarray(0, 4).equals(WAL_MAGIC) || remainder.length > 16);
      if (looksLikeFrame) {
        failClosed = true;
        return { frames, truncatedBytes: 0, failClosed };
      }
    }
    return { frames, truncatedBytes: buffer.length - offset, failClosed };
  }
  return { frames, truncatedBytes: 0, failClosed };
}
