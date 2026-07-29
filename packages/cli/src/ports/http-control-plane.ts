import { identityHeader, readSession, writeSession, type HuddleSession } from "../auth/session.js";
import type { ControlPlanePort, CreateRoomInput, ReadyRoom } from "./types.js";

type FetchLike = typeof fetch;

export type HttpControlPlaneOptions = {
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
};

function slugWord(): string {
  const words = ["quiet", "swift", "amber", "cedar", "lunar", "brave", "clear", "noble"];
  return words[Math.floor(Math.random() * words.length)] ?? "quiet";
}

function makeSlug(): string {
  return `${slugWord()}-${slugWord()}`;
}

function baseUrl(serverUrl: string): string {
  return serverUrl.replace(/\/$/, "");
}

function shareUrl(serverUrl: string, slug: string, roomId: string): string {
  const base = baseUrl(serverUrl);
  if (slug) return `${base}/r/${slug}`;
  return `${base}/#/room/${roomId}`;
}

async function ensureAuthSession(
  serverUrl: string,
  fetchImpl: FetchLike,
  env: NodeJS.ProcessEnv,
): Promise<HuddleSession> {
  const existing = await readSession(env);
  if (existing && (!existing.serverUrl || existing.serverUrl === baseUrl(serverUrl))) {
    return existing;
  }

  const res = await fetchImpl(`${baseUrl(serverUrl)}/v1/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-huddle-user": identityHeader(env),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`auth session failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as {
    session?: {
      sessionId: string;
      userId: string;
      displayName: string;
      expiresAt: string;
    };
  };
  const session = body.session;
  if (!session?.sessionId) {
    throw new Error("auth session response missing session");
  }

  const stored: HuddleSession = {
    sessionId: session.sessionId,
    userId: session.userId,
    displayName: session.displayName,
    expiresAt: session.expiresAt,
    serverUrl: baseUrl(serverUrl),
  };
  await writeSession(stored, env);
  return stored;
}

function authHeaders(session: HuddleSession): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${session.sessionId}`,
    "x-huddle-session": session.sessionId,
  };
}

/**
 * Live HTTP control-plane port: session → create room → invite.
 */
export function createHttpControlPlane(options: HttpControlPlaneOptions = {}): ControlPlanePort {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;

  return {
    kind: "control-plane",

    async health(serverUrl: string): Promise<{ ok: boolean; version?: string }> {
      try {
        const res = await fetchImpl(`${baseUrl(serverUrl)}/healthz`);
        if (!res.ok) return { ok: false };
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: string };
        const result: { ok: boolean; version?: string } = { ok: body.ok !== false };
        if (typeof body.version === "string") result.version = body.version;
        return result;
      } catch {
        return { ok: false };
      }
    },

    async createInviteOnlyRoom(input: CreateRoomInput): Promise<ReadyRoom> {
      const session = await ensureAuthSession(input.serverUrl, fetchImpl, env);
      const slug = makeSlug();
      const roomBody: Record<string, string> = { slug };
      if (input.name) roomBody.name = input.name;

      const roomRes = await fetchImpl(`${baseUrl(input.serverUrl)}/v1/rooms`, {
        method: "POST",
        headers: authHeaders(session),
        body: JSON.stringify(roomBody),
      });
      if (!roomRes.ok) {
        const text = await roomRes.text();
        throw new Error(`create room failed (${roomRes.status}): ${text}`);
      }
      const roomJson = (await roomRes.json()) as {
        room: { id: string; slug: string };
      };
      const roomId = roomJson.room.id;
      const roomSlug = roomJson.room.slug || slug;

      const inviteRes = await fetchImpl(
        `${baseUrl(input.serverUrl)}/v1/rooms/${encodeURIComponent(roomId)}/invites`,
        {
          method: "POST",
          headers: authHeaders(session),
          body: JSON.stringify({ role: "collaborator" }),
        },
      );
      if (!inviteRes.ok) {
        const text = await inviteRes.text();
        throw new Error(`create invite failed (${inviteRes.status}): ${text}`);
      }
      const inviteJson = (await inviteRes.json()) as {
        invite?: { expiresAt?: string };
      };
      let inviteExpiresInHours = 24;
      if (inviteJson.invite?.expiresAt) {
        const ms = Date.parse(inviteJson.invite.expiresAt) - Date.now();
        if (Number.isFinite(ms) && ms > 0) {
          inviteExpiresInHours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
        }
      }

      const room: ReadyRoom = {
        roomId,
        slug: roomSlug,
        shareUrl: shareUrl(input.serverUrl, roomSlug, roomId),
        policy: input.orgSlug ? "org" : "invite_only",
        workspace: `.huddle/worktrees/${roomSlug}`,
        inviteExpiresInHours,
        agent: "Codex",
        mode: "live",
      };
      if (input.orgSlug) room.orgSlug = input.orgSlug;
      return room;
    },
  };
}

/** @deprecated Prefer createHttpControlPlane — class alias for callers expecting a constructor. */
export class HttpControlPlanePort implements ControlPlanePort {
  readonly kind = "control-plane" as const;
  readonly #inner: ControlPlanePort;

  constructor(options: HttpControlPlaneOptions = {}) {
    this.#inner = createHttpControlPlane(options);
  }

  createInviteOnlyRoom(input: CreateRoomInput): Promise<ReadyRoom> {
    return this.#inner.createInviteOnlyRoom(input);
  }

  health(serverUrl: string): Promise<{ ok: boolean; version?: string }> {
    return this.#inner.health(serverUrl);
  }
}
