export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  method: string;
  id: JsonRpcId;
  params?: unknown;
};

export type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcFailure = {
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccess
  | JsonRpcFailure;

export function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return "method" in msg && "id" in msg && !("result" in msg) && !("error" in msg);
}

export function isJsonRpcNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return "method" in msg && !("id" in msg);
}

export function isJsonRpcSuccess(msg: JsonRpcMessage): msg is JsonRpcSuccess {
  return "id" in msg && "result" in msg;
}

export function isJsonRpcFailure(msg: JsonRpcMessage): msg is JsonRpcFailure {
  return "id" in msg && "error" in msg;
}

export function encodeJsonl(message: JsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseJsonlLine(line: string): JsonRpcMessage {
  const trimmed = line.trim();
  if (!trimmed) throw new Error("empty JSONL line");
  const parsed: unknown = JSON.parse(trimmed);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("JSONL message must be an object");
  }
  return parsed as JsonRpcMessage;
}
