import {
  createRoomEventEnvelope,
  type RoomEvent,
  type Visibility,
} from "@huddle/protocol";
import type { ApprovalVerifier, EvidenceDigester, SignedApprovalEvidence } from "@huddle/authz";
import {
  CodexAdapter,
  buildApprovalDecisionResponse,
  type CodexApprovalRequest,
  type TranslationResult,
} from "@huddle/codex-adapter";
import { verifyApprovalEvidence } from "./approval.js";
import type { RunnerFence } from "./epoch.js";
import { assertRunnerEpoch } from "./epoch.js";
import type { FsPort } from "./fs-port.js";
import { NodeFsPort, StorageUnavailableError } from "./fs-port.js";
import { acquireRoomLock, type RoomLock } from "./lock.js";
import { redactAndClassify } from "./redaction.js";
import {
  FakeOutboundSyncClient,
  type OutboundSyncClient,
} from "./sync/client.js";
import { FramedWal } from "./wal/index.js";
import type { WalRecordType } from "./wal/format.js";
import { rejectWorkspaceEscape } from "./paths.js";

export type RunnerCoreOptions = {
  roomId: string;
  fence: RunnerFence;
  codexVersion: string;
  fs?: FsPort;
  sync?: OutboundSyncClient;
  digester?: EvidenceDigester;
  verifier?: ApprovalVerifier;
  env?: NodeJS.ProcessEnv;
  worktreeRoot?: string;
};

export type RunnerHandle = {
  fence: RunnerFence;
  wal: FramedWal;
  adapter: CodexAdapter;
  lock: RoomLock;
  sync: OutboundSyncClient;
  storageUnavailable: boolean;
  close(): Promise<void>;
  appendDurable(recordId: string, recordType: WalRecordType, body: unknown): Promise<void>;
  handleTranslation(
    translated: TranslationResult,
    ids: { eventId: string; sequence: number; timestamp: string },
  ): Promise<RoomEvent | null>;
  verifyAndRespondApproval(input: {
    approval: CodexApprovalRequest;
    evidence: SignedApprovalEvidence;
    nowIso: string;
    consumedNonces: Set<string>;
  }): Promise<{
    allow: boolean;
    response: ReturnType<typeof buildApprovalDecisionResponse> | null;
  }>;
  assertPaths(paths: readonly string[]): Promise<boolean>;
};

/**
 * Compose local runner ownership: lock → WAL → policy/evidence → adapter → redact → sync.
 */
export async function startRunnerCore(options: RunnerCoreOptions): Promise<RunnerHandle> {
  const fs = options.fs ?? new NodeFsPort();
  const env = options.env ?? process.env;
  const sync = options.sync ?? new FakeOutboundSyncClient();

  const lockResult = await acquireRoomLock(options.roomId, options.fence, fs, env);
  if (!lockResult.ok) {
    throw new Error(lockResult.error.message);
  }

  const walResult = await FramedWal.open(options.roomId, options.fence, fs, env);
  if (!walResult.ok) {
    await lockResult.lock.release();
    throw new Error(walResult.error.message);
  }

  const adapter = new CodexAdapter({
    version: options.codexVersion,
    diagnosticId: `runner-${options.roomId}`,
  });

  let storageUnavailable = false;
  const wal = walResult.wal;
  const lock = lockResult.lock;

  const handle: RunnerHandle = {
    fence: options.fence,
    wal,
    adapter,
    lock,
    sync,
    get storageUnavailable() {
      return storageUnavailable || wal.disabled;
    },
    async close() {
      await lock.release();
    },
    async appendDurable(recordId, recordType, body) {
      const epoch = assertRunnerEpoch(options.fence, options.fence, "append");
      if (!epoch.ok) throw new Error(epoch.error.message);
      try {
        const result = await wal.append({ recordId, recordType, body }, options.fence);
        if (!result.ok) throw new Error(result.error.message);
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          storageUnavailable = true;
        }
        throw err;
      }
    },
    async handleTranslation(translated, ids) {
      if (translated.kind === "quarantine") {
        return createRoomEventEnvelope({
          eventId: ids.eventId,
          roomId: options.roomId,
          roomIncarnation: options.fence.roomIncarnation,
          runnerEpoch: options.fence.runnerEpoch,
          sequence: ids.sequence,
          timestamp: ids.timestamp,
          actor: { type: "runner", id: "runner" },
          provider: "codex",
          type: "run.failed",
          payload: { reason: `quarantined provider message: ${translated.method}` },
          visibility: "owner",
        });
      }
      if (translated.kind !== "event") return null;

      const redactedPayload = redactPayload(translated.event.payload);
      const visibility: Visibility = translated.event.visibility ?? "room";
      const envelope = {
        eventId: ids.eventId,
        roomId: options.roomId,
        roomIncarnation: options.fence.roomIncarnation,
        runnerEpoch: options.fence.runnerEpoch,
        sequence: ids.sequence,
        timestamp: ids.timestamp,
        actor: { type: "agent" as const, id: "codex" },
        provider: "codex" as const,
        type: translated.event.type,
        payload: redactedPayload as never,
        visibility,
      };
      if (translated.event.nativeIds) {
        return createRoomEventEnvelope({ ...envelope, nativeIds: translated.event.nativeIds });
      }
      return createRoomEventEnvelope(envelope);
    },
    async verifyAndRespondApproval(input) {
      const material = {
        category: input.approval.category,
        raw: input.approval.raw,
        ...(input.approval.command !== undefined ? { command: input.approval.command } : {}),
        ...(input.approval.cwd !== undefined ? { cwd: input.approval.cwd } : {}),
        ...(input.approval.affectedPaths !== undefined
          ? { affectedPaths: input.approval.affectedPaths }
          : {}),
        ...(input.approval.explanation !== undefined
          ? { providerExplanation: input.approval.explanation }
          : {}),
      };

      const gate = verifyApprovalEvidence(
        {
          fence: {
            roomIncarnation: input.evidence.roomIncarnation,
            runnerEpoch: input.evidence.runnerEpoch,
          },
          expectedFence: options.fence,
          evidence: input.evidence,
          material,
          expectedNonce: input.evidence.requestNonce,
          nowIso: input.nowIso,
          consumedNonces: input.consumedNonces,
        },
        {
          ...(options.digester ? { digester: options.digester } : {}),
          ...(options.verifier ? { verifier: options.verifier } : {}),
        },
      );

      if (!gate.ok) {
        return {
          allow: false,
          response: buildApprovalDecisionResponse(input.approval.requestId, "deny"),
        };
      }

      input.consumedNonces.add(input.evidence.requestNonce);
      await handle.appendDurable(`approval-${input.evidence.requestNonce}`, "approval_intent", {
        decision: gate.decision,
        digestHex: gate.digestHex,
      });

      if (gate.decision !== "allow") {
        return {
          allow: false,
          response: buildApprovalDecisionResponse(input.approval.requestId, gate.decision),
        };
      }

      return {
        allow: true,
        response: buildApprovalDecisionResponse(input.approval.requestId, "allow"),
      };
    },
    async assertPaths(paths) {
      if (!options.worktreeRoot) return true;
      const result = await rejectWorkspaceEscape(options.worktreeRoot, paths, fs);
      return result.ok;
    },
  };

  return handle;
}

function redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      out[key] = redactAndClassify(value).text;
    } else {
      out[key] = value;
    }
  }
  return out;
}
