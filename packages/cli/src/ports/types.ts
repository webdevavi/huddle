export type RoomAccessPolicy = "invite_only" | "org";

export type ReadyRoom = {
  roomId: string;
  slug: string;
  shareUrl: string;
  policy: RoomAccessPolicy;
  orgSlug?: string;
  workspace: string;
  inviteExpiresInHours: number;
  agent: string;
  mode: "stub" | "live";
};

export type CreateRoomInput = {
  name?: string;
  orgSlug?: string;
  noWorktree: boolean;
  serverUrl: string;
  nonInteractive: boolean;
};

export type ControlPlanePort = {
  readonly kind: "control-plane";
  createInviteOnlyRoom(input: CreateRoomInput): Promise<ReadyRoom>;
  health(serverUrl: string): Promise<{ ok: boolean; version?: string }>;
};

export type RunnerPort = {
  readonly kind: "runner";
  ensureWorkspace(input: { noWorktree: boolean }): Promise<{ workspace: string }>;
  startAgent(input: { agent: "codex"; live: boolean }): Promise<{ agent: string; mode: "stub" | "live" }>;
};

export type CodexDetection = {
  found: boolean;
  version?: string;
  path?: string;
  supported: boolean;
};
