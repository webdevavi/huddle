export {
  huddleHome,
  roomMetadataDir,
  roomWalDir,
  roomLockPath,
} from "./metadata.js";

export {
  assertRunnerEpoch,
  isStaleEpoch,
  type RunnerFence,
  type EpochCheckResult,
} from "./epoch.js";

export {
  NodeFsPort,
  FaultyFsPort,
  StorageUnavailableError,
  type FsPort,
} from "./fs-port.js";

export { acquireRoomLock, type RoomLock } from "./lock.js";

export {
  WAL_MAGIC,
  WAL_VERSION,
  encodeFrame,
  encodeHeaderFrame,
  encodeRecordFrame,
  encodeCheckpointFrame,
  tryDecodeFrame,
  recoverSegment,
  crc32,
  type WalRecordType,
  type WalRecordPayload,
  type WalHeaderPayload,
  type WalCheckpointPayload,
  type DecodedFrame,
} from "./wal/format.js";

export { FramedWal, type WalAppendInput, type WalOpenResult } from "./wal/index.js";

export {
  assertPathInsideRoot,
  rejectWorkspaceEscape,
  type PathCheckResult,
} from "./paths.js";

export {
  createRoomWorktree,
  weakIsolationWarning,
  type WorktreeSpec,
  type WorktreeResult,
  type WeakIsolationWarning,
} from "./worktree.js";

export {
  evaluateLocalPolicy,
  approvalCapabilityFor,
  type LocalPolicyDecision,
  type LocalPolicyContext,
} from "./policy.js";

export {
  verifyApprovalEvidence,
  type ApprovalGateDeps,
  type ApprovalGateInput,
  type ApprovalGateResult,
} from "./approval.js";

export {
  redactAndClassify,
  classifyApprovalVisibility,
  type RedactionResult,
  type RedactionOptions,
} from "./redaction.js";

export {
  FakeOutboundSyncClient,
  syncOutbound,
  type OutboundSyncClient,
  type OutboundSyncBatch,
  type SyncAck,
  type SyncGateResult,
} from "./sync/client.js";

export {
  HttpOutboundSyncClient,
  type HttpOutboundSyncClientOptions,
} from "./sync/http.js";

export { sanitizeRunnerEnv } from "./env.js";
export { resolveExecutable, type ExecutableLookupResult } from "./executable.js";
export { assertSubmodulePolicy, type SubmodulePolicyResult } from "./submodule.js";
export { runHuddleGit, type HuddleGitResult } from "./git-safe.js";

export {
  startRunnerCore,
  type RunnerCoreOptions,
  type RunnerHandle,
} from "./runner.js";
