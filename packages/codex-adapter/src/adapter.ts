import { EventEmitter } from "node:events";
import {
  encodeJsonl,
  parseJsonlLine,
  type JsonRpcMessage,
  type JsonRpcRequest,
} from "./transport/jsonl.js";
import { translateCodexMessage, type TranslationResult } from "./translate.js";
import { detectCodexCompatibility } from "./version.js";
import { SUPPORTED_CODEX_APP_SERVER } from "./schema/pin.js";
import type { HuddleError } from "@huddle/protocol";

export type CodexAdapterConfig = {
  /** Detected or declared Codex App Server version. */
  version: string;
  diagnosticId?: string;
};

/**
 * In-process Codex App Server adapter boundary.
 * Speaks JSONL JSON-RPC against a duplex stream (real child process or fake).
 */
export class CodexAdapter extends EventEmitter {
  readonly version: string;
  readonly schemaFingerprint: string;
  #nextId = 1;
  #buffer = "";
  #ready = false;

  constructor(config: CodexAdapterConfig) {
    super();
    const detection = detectCodexCompatibility(
      config.version,
      config.diagnosticId ?? "codex-adapter-init",
    );
    if (!detection.ok) {
      throw new CodexIncompatibleError(detection.error.message, detection.error);
    }
    this.version = detection.version;
    this.schemaFingerprint = detection.schemaFingerprint;
  }

  get ready(): boolean {
    return this.#ready;
  }

  allocateId(): number {
    const id = this.#nextId;
    this.#nextId += 1;
    return id;
  }

  /** Build the initialize request for the App Server handshake. */
  buildInitializeRequest(clientName = "huddle"): JsonRpcRequest {
    return {
      method: "initialize",
      id: this.allocateId(),
      params: {
        clientInfo: {
          name: clientName,
          version: "0.0.0",
        },
        capabilities: {},
      },
    };
  }

  buildInitializedNotification(): { method: string; params: Record<string, never> } {
    return { method: "initialized", params: {} };
  }

  buildTurnStart(threadId: string, text: string): JsonRpcRequest {
    return {
      method: "turn/start",
      id: this.allocateId(),
      params: {
        threadId,
        input: [{ type: "text", text }],
      },
    };
  }

  buildTurnSteer(threadId: string, text: string, expectedTurnId: string): JsonRpcRequest {
    return {
      method: "turn/steer",
      id: this.allocateId(),
      params: {
        threadId,
        expectedTurnId,
        input: [{ type: "text", text }],
      },
    };
  }

  buildTurnInterrupt(threadId: string, turnId: string): JsonRpcRequest {
    return {
      method: "turn/interrupt",
      id: this.allocateId(),
      params: { threadId, turnId },
    };
  }

  encode(message: JsonRpcMessage): string {
    return encodeJsonl(message);
  }

  /** Feed inbound stdout/JSONL bytes into the translator. */
  pushInbound(chunk: string): void {
    this.#buffer += chunk;
    let newline = this.#buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line.trim()) {
        this.#handleLine(line);
      }
      newline = this.#buffer.indexOf("\n");
    }
  }

  markReady(): void {
    this.#ready = true;
  }

  #handleLine(line: string): void {
    try {
      const message = parseJsonlLine(line);
      this.emit("raw", message);
      const translated = translateCodexMessage(message);
      this.emit("message", translated);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export class CodexIncompatibleError extends Error {
  readonly huddleError: HuddleError;

  constructor(message: string, huddleError: HuddleError) {
    super(message);
    this.name = "CodexIncompatibleError";
    this.huddleError = huddleError;
  }
}

export function pinnedSchemaInfo(): {
  version: string;
  schemaFingerprint: string;
  min: string;
  max: string;
} {
  return {
    version: SUPPORTED_CODEX_APP_SERVER.pinned,
    schemaFingerprint: SUPPORTED_CODEX_APP_SERVER.schemaFingerprint,
    min: SUPPORTED_CODEX_APP_SERVER.min,
    max: SUPPORTED_CODEX_APP_SERVER.max,
  };
}

export type { TranslationResult };
