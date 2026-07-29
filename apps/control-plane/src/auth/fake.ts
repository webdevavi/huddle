import { createHash, randomBytes } from "node:crypto";
import type { Capability, MembershipRole } from "@huddle/authz";
import type { ControlPlaneStore } from "@huddle/persistence";
import type { Clock, IdGenerator } from "@huddle/testkit";

export type FakeIdentity = {
  userId: string;
  displayName: string;
};

export type AuthSession = {
  sessionId: string;
  userId: string;
  displayName: string;
  expiresAt: string;
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function requestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export class FakeAuthService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * Mint or reuse a fake identity session.
   * Header: `x-huddle-user: userId[:displayName]`
   */
  async ensureSession(identityHeader: string | undefined): Promise<AuthSession> {
    const raw = identityHeader?.trim() || "alice:Alice";
    const [userIdPart, ...rest] = raw.split(":");
    const userId = userIdPart && userIdPart.length > 0 ? userIdPart : "alice";
    const displayName = rest.length > 0 ? rest.join(":") : userId;

    const now = this.clock.nowIso();
    await this.store.upsertUser({
      id: userId,
      displayName,
      createdAt: now,
    });

    const sessionId = this.ids.uuid();
    const expiresAt = new Date(this.clock.nowMs() + SESSION_TTL_MS).toISOString();
    await this.store.createSession({
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
    });

    return { sessionId, userId, displayName, expiresAt };
  }

  async resolveSession(sessionId: string | undefined): Promise<AuthSession | null> {
    if (!sessionId) return null;
    const session = await this.store.getSession(sessionId);
    if (!session) return null;
    if (Date.parse(this.clock.nowIso()) > Date.parse(session.expiresAt)) {
      await this.store.deleteSession(sessionId);
      return null;
    }
    const user = await this.store.getUser(session.userId);
    if (!user) return null;
    return {
      sessionId: session.id,
      userId: user.id,
      displayName: user.displayName,
      expiresAt: session.expiresAt,
    };
  }

  /** Create a session for an already-resolved identity (e.g. GitHub OAuth). */
  async createSessionForUser(user: {
    userId: string;
    displayName: string;
  }): Promise<AuthSession> {
    const now = this.clock.nowIso();
    await this.store.upsertUser({
      id: user.userId,
      displayName: user.displayName,
      createdAt: now,
    });
    const sessionId = this.ids.uuid();
    const expiresAt = new Date(this.clock.nowMs() + SESSION_TTL_MS).toISOString();
    await this.store.createSession({
      id: sessionId,
      userId: user.userId,
      expiresAt,
      createdAt: now,
    });
    return {
      sessionId,
      userId: user.userId,
      displayName: user.displayName,
      expiresAt,
    };
  }
}

export function capabilityForInputKind(
  kind: "comment" | "suggest" | "queue" | "steer",
): Capability {
  switch (kind) {
    case "comment":
      return "room.comment";
    case "suggest":
      return "room.suggest";
    case "queue":
      return "room.queue";
    case "steer":
      return "room.steer";
  }
}

export function approvalCapability(category: string): Capability {
  const mapped = `approval.resolve.${category}` as Capability;
  return mapped;
}

export type MemberContext = {
  memberId: string;
  role: MembershipRole;
  userId: string;
  displayName: string | null;
};

export function newStateToken(): string {
  return randomBytes(16).toString("hex");
}
