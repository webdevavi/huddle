import { createHash } from "node:crypto";
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
  ensureSession(identityHeader: string | undefined): AuthSession {
    const raw = identityHeader?.trim() || "alice:Alice";
    const [userIdPart, ...rest] = raw.split(":");
    const userId = userIdPart && userIdPart.length > 0 ? userIdPart : "alice";
    const displayName = rest.length > 0 ? rest.join(":") : userId;

    const now = this.clock.nowIso();
    this.store.upsertUser({
      id: userId,
      displayName,
      createdAt: now,
    });

    const sessionId = this.ids.uuid();
    const expiresAt = new Date(this.clock.nowMs() + SESSION_TTL_MS).toISOString();
    this.store.createSession({
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
    });

    return { sessionId, userId, displayName, expiresAt };
  }

  resolveSession(sessionId: string | undefined): AuthSession | null {
    if (!sessionId) return null;
    const session = this.store.getSession(sessionId);
    if (!session) return null;
    if (Date.parse(this.clock.nowIso()) > Date.parse(session.expiresAt)) {
      this.store.deleteSession(sessionId);
      return null;
    }
    const user = this.store.getUser(session.userId);
    if (!user) return null;
    return {
      sessionId: session.id,
      userId: user.id,
      displayName: user.displayName,
      expiresAt: session.expiresAt,
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
