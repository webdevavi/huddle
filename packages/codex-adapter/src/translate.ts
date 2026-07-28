import type { RoomEventType } from "@huddle/protocol";
import { KNOWN_SERVER_MESSAGES, type KnownServerMessage } from "./schema/pin.js";
import type { JsonRpcMessage, JsonRpcNotification, JsonRpcRequest } from "./transport/jsonl.js";
import { isJsonRpcNotification, isJsonRpcRequest } from "./transport/jsonl.js";

export type TranslatedAgentEvent = {
  type: RoomEventType;
  payload: Record<string, unknown>;
  nativeIds?: Record<string, string>;
  visibility?: "room" | "approvers" | "owner";
};

export type CodexApprovalRequest = {
  requestId: string | number;
  method: "execCommandApproval" | "applyPatchApproval";
  category: string;
  threadId?: string;
  turnId?: string;
  command?: string;
  cwd?: string;
  affectedPaths?: string[];
  explanation?: string;
  raw: unknown;
};

export type TranslationResult =
  | { kind: "event"; event: TranslatedAgentEvent }
  | { kind: "approval_request"; approval: CodexApprovalRequest }
  | { kind: "quarantine"; method: string; reason: string; raw: unknown }
  | { kind: "ignore" };

function isKnownServerMessage(method: string): method is KnownServerMessage {
  return (KNOWN_SERVER_MESSAGES as readonly string[]).includes(method);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function translateCodexMessage(message: JsonRpcMessage): TranslationResult {
  if (isJsonRpcRequest(message)) return translateServerRequest(message);
  if (isJsonRpcNotification(message)) return translateNotification(message);
  return { kind: "ignore" };
}

function translateServerRequest(message: JsonRpcRequest): TranslationResult {
  if (!isKnownServerMessage(message.method)) {
    return { kind: "quarantine", method: message.method, reason: "unknown_server_request", raw: message };
  }
  if (message.method === "execCommandApproval" || message.method === "applyPatchApproval") {
    const params = asRecord(message.params);
    const category =
      message.method === "execCommandApproval"
        ? classifyCommandCategory(stringField(params, "command"))
        : "workspace_write";
    const approval: CodexApprovalRequest = {
      requestId: message.id,
      method: message.method,
      category,
      raw: message.params,
    };
    const threadId = stringField(params, "threadId");
    const turnId = stringField(params, "turnId");
    const command = stringField(params, "command");
    const cwd = stringField(params, "cwd");
    const explanation = stringField(params, "reason") ?? stringField(params, "explanation");
    if (threadId !== undefined) approval.threadId = threadId;
    if (turnId !== undefined) approval.turnId = turnId;
    if (command !== undefined) approval.command = command;
    if (cwd !== undefined) approval.cwd = cwd;
    if (explanation !== undefined) approval.explanation = explanation;
    const paths = params["files"] ?? params["affectedPaths"];
    if (Array.isArray(paths)) {
      approval.affectedPaths = paths.filter((p): p is string => typeof p === "string");
    }
    return { kind: "approval_request", approval };
  }
  return { kind: "ignore" };
}

function translateNotification(message: JsonRpcNotification): TranslationResult {
  if (!isKnownServerMessage(message.method)) {
    return { kind: "quarantine", method: message.method, reason: "unknown_notification", raw: message };
  }
  const params = asRecord(message.params);
  switch (message.method) {
    case "item/agentMessage/delta": {
      const messageId = stringField(params, "itemId") ?? stringField(params, "id") ?? "unknown";
      const delta = stringField(params, "delta") ?? stringField(params, "text") ?? "";
      return {
        kind: "event",
        event: { type: "agent.message_delta", payload: { messageId, delta }, nativeIds: { itemId: messageId } },
      };
    }
    case "item/agentMessage": {
      const messageId = stringField(params, "itemId") ?? stringField(params, "id") ?? "unknown";
      const text = stringField(params, "text") ?? "";
      return {
        kind: "event",
        event: { type: "agent.message_completed", payload: { messageId, text }, nativeIds: { itemId: messageId } },
      };
    }
    case "item/commandExecution": {
      const commandId = stringField(params, "itemId") ?? stringField(params, "id") ?? "unknown";
      const command = stringField(params, "command") ?? "";
      return {
        kind: "event",
        event: { type: "agent.command_started", payload: { commandId, command }, nativeIds: { itemId: commandId } },
      };
    }
    case "item/fileChange": {
      const diffId = stringField(params, "itemId") ?? stringField(params, "id") ?? "unknown";
      const summary = stringField(params, "summary") ?? "file change";
      return {
        kind: "event",
        event: { type: "agent.diff_updated", payload: { diffId, summary }, nativeIds: { itemId: diffId } },
      };
    }
    case "turn/started": {
      const nativeIds = pickNativeIds(params, ["threadId", "turnId"]);
      const event: TranslatedAgentEvent = { type: "run.started", payload: {} };
      if (nativeIds) event.nativeIds = nativeIds;
      return { kind: "event", event };
    }
    case "turn/completed": {
      const status = stringField(params, "status");
      if (status === "interrupted") {
        return { kind: "event", event: { type: "run.interrupted", payload: {} } };
      }
      if (status === "failed") {
        return {
          kind: "event",
          event: { type: "run.failed", payload: { reason: stringField(params, "reason") ?? "turn failed" } },
        };
      }
      return { kind: "event", event: { type: "run.completed", payload: {} } };
    }
    case "error":
      return {
        kind: "event",
        event: { type: "run.failed", payload: { reason: stringField(params, "message") ?? "provider error" } },
      };
    default:
      return { kind: "ignore" };
  }
}

function pickNativeIds(params: Record<string, unknown>, keys: string[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = stringField(params, key);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function classifyCommandCategory(command: string | undefined): string {
  if (!command) return "test_command";
  const lower = command.toLowerCase();
  if (/\b(curl|wget|nc|ssh|http)\b/.test(lower)) return "network";
  if (/\bgit\s+(push|pull|fetch)\b/.test(lower)) return "git_publish";
  if (/\b(deploy|kubectl|terraform|pulumi)\b/.test(lower)) return "deployment";
  return "test_command";
}

export function buildApprovalDecisionResponse(
  requestId: string | number,
  decision: "allow" | "deny" | "cancel",
): { id: string | number; result: { decision: string } } {
  return { id: requestId, result: { decision } };
}
