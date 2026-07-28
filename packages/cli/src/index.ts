/**
 * @huddle/cli — golden-path CLI, doctor/diagnostics, and stub ports (WS-E).
 */
export { runCli, installSignalHandlers, type RunCliOptions } from "./cli.js";
export { ExitCode } from "./exit-codes.js";
export { CLI_VERSION, HUDDLE_DEFAULT_SERVER } from "./version.js";
export {
  DX_CATALOG,
  catalogEntry,
  createDxError,
  renderDxError,
  type DxError,
  type DxErrorCode,
} from "./errors/index.js";
export {
  createStubControlPlane,
  createStubRunner,
  detectCodex,
  SUPPORTED_CODEX_RANGE,
  type ControlPlanePort,
  type RunnerPort,
  type ReadyRoom,
} from "./ports/index.js";
export { loadConfig, listConfigEntries, DEFAULT_CONFIG } from "./config/index.js";
export { HELP_TEXT } from "./commands/types.js";
