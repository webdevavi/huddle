import { randomBytes } from "node:crypto";
import type { ControlPlanePort, CreateRoomInput, ReadyRoom, RunnerPort } from "./types.js";

function slugWord(): string {
  const words = ["quiet", "swift", "amber", "cedar", "lunar", "brave", "clear", "noble"];
  return words[Math.floor(Math.random() * words.length)] ?? "quiet";
}

function makeSlug(): string {
  return `${slugWord()}-${slugWord()}`;
}

export function createStubControlPlane(): ControlPlanePort {
  return {
    kind: "control-plane",
    async createInviteOnlyRoom(input: CreateRoomInput): Promise<ReadyRoom> {
      const slug = makeSlug();
      const roomId = `room_${randomBytes(4).toString("hex")}`;
      const base = input.serverUrl.replace(/\/$/, "");
      const room: ReadyRoom = {
        roomId,
        slug,
        shareUrl: `${base}/r/${slug}`,
        policy: input.orgSlug ? "org" : "invite_only",
        workspace: ".huddle/worktrees/pending",
        inviteExpiresInHours: 24,
        agent: "Codex",
        mode: "stub",
      };
      if (input.orgSlug) {
        room.orgSlug = input.orgSlug;
      }
      return room;
    },
    async health(serverUrl: string): Promise<{ ok: boolean; version?: string }> {
      // Stub always reports reachable for local DX without network.
      void serverUrl;
      return { ok: true, version: "0.0.0-stub" };
    },
  };
}

export function createStubRunner(): RunnerPort {
  return {
    kind: "runner",
    async ensureWorkspace(input: { noWorktree: boolean }): Promise<{ workspace: string }> {
      if (input.noWorktree) {
        return { workspace: "." };
      }
      const slug = makeSlug();
      return { workspace: `.huddle/worktrees/${slug}` };
    },
    async startAgent(input: { agent: "codex"; live: boolean }): Promise<{
      agent: string;
      mode: "stub" | "live";
    }> {
      return { agent: input.agent === "codex" ? "Codex" : input.agent, mode: input.live ? "live" : "stub" };
    },
  };
}
