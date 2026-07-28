/**
 * Pinned Codex App Server support window.
 * Fixtures under packages/codex-adapter/fixtures/<version>/ declare the pin.
 */

export const SUPPORTED_CODEX_APP_SERVER = {
  min: "0.50.0",
  max: "0.50.99",
  pinned: "0.50.0",
  schemaFingerprint: "codex-app-server-0.50.0-v1",
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
