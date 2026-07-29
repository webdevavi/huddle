/** Shared adapter contract (spec § AgentAdapter). Not a public plugin API yet. */

export type AgentCapabilities = {
  provider: "opencode" | "codex" | "claude" | "acp";
  resume: boolean;
  steerInFlight: boolean;
  interrupt: boolean;
  plans: boolean;
  structuredDiffs: boolean;
  commandApprovals: boolean;
  fileApprovals: boolean;
  permissionApprovals: boolean;
  transport: string;
  status: "skeleton" | "experimental" | "supported";
  baseUrl?: string;
};

export type SessionRef = {
  sessionId: string;
  provider: string;
};

export type TurnRef = {
  turnId: string;
  sessionId: string;
};

export type NativeAgentEvent = {
  kind: string;
  provider: string;
  message?: string;
  raw?: unknown;
};

export interface AgentAdapter {
  capabilities(): AgentCapabilities;
  startSession(input: { workspace: string; prompt?: string }): Promise<SessionRef>;
  resumeSession(ref: SessionRef): Promise<void>;
  startTurn(input: { session: SessionRef; text: string }): Promise<TurnRef>;
  steerTurn?(turn: TurnRef, input: { text: string }): Promise<void>;
  interruptTurn(turn: TurnRef): Promise<void>;
  resolveApproval(
    request: { requestId: string },
    decision: { allow: boolean },
  ): Promise<void>;
  events(): AsyncIterable<NativeAgentEvent>;
  shutdown(): Promise<void>;
}
