import { EventEmitter } from "node:events";
import {
  encodeJsonl,
  parseJsonlLine,
  isJsonRpcRequest,
  type JsonRpcMessage,
  type JsonRpcRequest,
} from "../transport/jsonl.js";
import { SUPPORTED_CODEX_APP_SERVER } from "../schema/pin.js";

export type FakeCodexServerOptions = {
  version?: string;
  /** Auto-approve? default false — emits approval requests for commands. */
  autoApprove?: boolean;
};

/**
 * Deterministic in-process fake Codex App Server for contract tests.
 * Speaks the same JSONL JSON-RPC surface as the real binary.
 */
export class FakeCodexServer extends EventEmitter {
  readonly version: string;
  #threadCounter = 0;
  #turnCounter = 0;
  #itemCounter = 0;
  #outbound: string[] = [];
  #autoApprove: boolean;

  constructor(options: FakeCodexServerOptions = {}) {
    super();
    this.version = options.version ?? SUPPORTED_CODEX_APP_SERVER.pinned;
    this.#autoApprove = options.autoApprove ?? false;
  }

  /** Drain encoded outbound lines produced since last call. */
  drainOutbound(): string[] {
    const lines = this.#outbound;
    this.#outbound = [];
    return lines;
  }

  pushClientMessage(raw: string): void {
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const message = parseJsonlLine(line);
      this.#handle(message);
    }
  }

  /** Simulate a spontaneous server notification (e.g. from fixture replay). */
  emitServerMessage(message: JsonRpcMessage): void {
    this.#send(message);
  }

  #send(message: JsonRpcMessage): void {
    const encoded = encodeJsonl(message);
    this.#outbound.push(encoded);
    this.emit("outbound", encoded);
  }

  #handle(message: JsonRpcMessage): void {
    if (!isJsonRpcRequest(message)) {
      return;
    }
    switch (message.method) {
      case "initialize":
        this.#send({
          id: message.id,
          result: {
            serverInfo: {
              name: "fake-codex-app-server",
              version: this.version,
            },
            schemaFingerprint: SUPPORTED_CODEX_APP_SERVER.schemaFingerprint,
          },
        });
        break;
      case "thread/start":
        this.#threadCounter += 1;
        this.#send({
          id: message.id,
          result: { threadId: `thr_${this.#threadCounter}` },
        });
        this.#send({
          method: "thread/started",
          params: { threadId: `thr_${this.#threadCounter}` },
        });
        break;
      case "turn/start":
        this.#handleTurnStart(message);
        break;
      case "turn/steer":
        this.#send({
          id: message.id,
          result: {
            turnId: asRecord(message.params)["expectedTurnId"] ?? `turn_${this.#turnCounter}`,
          },
        });
        break;
      case "turn/interrupt":
        this.#send({ id: message.id, result: { ok: true } });
        this.#send({
          method: "turn/completed",
          params: {
            threadId: asRecord(message.params)["threadId"],
            turnId: asRecord(message.params)["turnId"],
            status: "interrupted",
          },
        });
        break;
      default:
        this.#send({
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` },
        });
    }
  }

  #handleTurnStart(message: JsonRpcRequest): void {
    this.#turnCounter += 1;
    this.#itemCounter += 1;
    const params = asRecord(message.params);
    const threadId = typeof params["threadId"] === "string" ? params["threadId"] : "thr_1";
    const turnId = `turn_${this.#turnCounter}`;
    const itemId = `item_${this.#itemCounter}`;

    this.#send({ id: message.id, result: { turn: { id: turnId, threadId } } });
    this.#send({ method: "turn/started", params: { threadId, turnId } });
    this.#send({
      method: "item/agentMessage/delta",
      params: { itemId, delta: "Working…", threadId, turnId },
    });
    this.#send({
      method: "item/agentMessage",
      params: { itemId, text: "Working… done.", threadId, turnId },
    });

    const input = params["input"];
    const text =
      Array.isArray(input) &&
      typeof input[0] === "object" &&
      input[0] !== null &&
      "text" in input[0] &&
      typeof (input[0] as { text: unknown }).text === "string"
        ? (input[0] as { text: string }).text
        : "";

    if (/\b(curl|npm publish|git push)\b/i.test(text) && !this.#autoApprove) {
      this.#send({
        method: "execCommandApproval",
        id: `approval_${this.#itemCounter}`,
        params: {
          threadId,
          turnId,
          command: text,
          cwd: "/workspace",
          reason: "policy requires approval",
        },
      });
      return;
    }

    this.#send({
      method: "turn/completed",
      params: { threadId, turnId, status: "completed" },
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
