/**
 * OpenCode adapter skeleton (Phase 3 provider expansion).
 * Intentionally incomplete — validates the AgentAdapter boundary before a public plugin API.
 */

import type {
  AgentAdapter,
  AgentCapabilities,
  NativeAgentEvent,
  SessionRef,
  TurnRef,
} from "./types.js";

export type OpenCodeAdapterConfig = {
  baseUrl?: string;
  diagnosticId?: string;
};

/**
 * Stub OpenCode adapter. Methods throw until Phase 3 implementation lands.
 * Capabilities advertise the negotiated surface for future HTTP/event-stream wiring.
 */
export class OpenCodeAdapter implements AgentAdapter {
  readonly #config: OpenCodeAdapterConfig;

  constructor(config: OpenCodeAdapterConfig = {}) {
    this.#config = config;
  }

  capabilities(): AgentCapabilities {
    return {
      provider: "opencode",
      resume: true,
      steerInFlight: true,
      interrupt: true,
      plans: true,
      structuredDiffs: true,
      commandApprovals: true,
      fileApprovals: true,
      permissionApprovals: true,
      transport: "http+sse",
      status: "skeleton",
      ...(this.#config.baseUrl !== undefined ? { baseUrl: this.#config.baseUrl } : {}),
    };
  }

  startSession(_input: { workspace: string; prompt?: string }): Promise<SessionRef> {
    return Promise.reject(notImplemented("startSession"));
  }

  resumeSession(_ref: SessionRef): Promise<void> {
    return Promise.reject(notImplemented("resumeSession"));
  }

  startTurn(_input: { session: SessionRef; text: string }): Promise<TurnRef> {
    return Promise.reject(notImplemented("startTurn"));
  }

  steerTurn(_turn: TurnRef, _input: { text: string }): Promise<void> {
    return Promise.reject(notImplemented("steerTurn"));
  }

  interruptTurn(_turn: TurnRef): Promise<void> {
    return Promise.reject(notImplemented("interruptTurn"));
  }

  resolveApproval(
    _request: { requestId: string },
    _decision: { allow: boolean },
  ): Promise<void> {
    return Promise.reject(notImplemented("resolveApproval"));
  }

  async *events(): AsyncIterable<NativeAgentEvent> {
    yield {
      kind: "provider.status",
      provider: "opencode",
      message: "OpenCode adapter skeleton — not connected",
    };
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

function notImplemented(method: string): Error {
  return new Error(
    `OpenCodeAdapter.${method} is not implemented yet (Phase 3). ` +
      `See docs/plans/huddle-product-technical-spec.md provider expansion.`,
  );
}
