/**
 * Pinned Codex App Server support window (protocol fixtures).
 * CLI binary versions are tracked separately via SUPPORTED_CODEX_CLI.
 * Fixtures under packages/codex-adapter/fixtures/<version>/ declare the pin.
 */

export const SUPPORTED_CODEX_APP_SERVER = {
  min: "0.50.0",
  max: "0.50.99",
  pinned: "0.50.0",
  schemaFingerprint: "codex-app-server-0.50.0-v1",
} as const;

/**
 * Codex CLI versions that Huddle detects as live-capable.
 * App Server protocol negotiation still uses SUPPORTED_CODEX_APP_SERVER.
 */
export const SUPPORTED_CODEX_CLI = {
  min: "0.145.0",
  /** Inclusive upper bound of the advertised support band (patch ignored for messaging). */
  rangeLabel: ">=0.145.0",
  recommended: "0.146.0",
} as const;

export type SupportedCodexRange = typeof SUPPORTED_CODEX_APP_SERVER;

export const KNOWN_CLIENT_METHODS = [
  "initialize",
  "thread/start",
  "thread/resume",
  "turn/start",
  "turn/steer",
  "turn/interrupt",
] as const;

export const KNOWN_SERVER_MESSAGES = [
  "initialized",
  "thread/started",
  "turn/started",
  "turn/completed",
  "item/agentMessage/delta",
  "item/agentMessage",
  "item/commandExecution",
  "item/fileChange",
  "item/completed",
  "error",
  "execCommandApproval",
  "applyPatchApproval",
] as const;

export type KnownClientMethod = (typeof KNOWN_CLIENT_METHODS)[number];
export type KnownServerMessage = (typeof KNOWN_SERVER_MESSAGES)[number];
