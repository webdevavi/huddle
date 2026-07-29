import type { RoomEvent } from "@huddle/protocol";
import type { MembershipRole } from "@huddle/authz";
import type {
  ConnectionStatus,
  ControlPlaneClient,
  ResolveApprovalRequest,
  RoomSnapshot,
  SessionIdentity,
  SubmitInputRequest,
} from "./types.js";

type FetchLike = typeof fetch;
type WsCtor = typeof WebSocket;

export type LiveControlPlaneClientOptions = {
  baseUrl: string;
  /** Fake identity header value, e.g. `bob:Bob` */
  identity?: string;
  fetchImpl?: FetchLike;
  WebSocketImpl?: WsCtor;
  /** Session token from a prior login; otherwise minted via POST /v1/auth/session */
  sessionId?: string;
};

type ApiRoom = {
  id: string;
  slug: string;
  name?: string | null;
  state?: string;
  membershipVersion?: number;
  lastSequence?: number;
  incarnation?: string;
};

type ApiMember = {
  memberId: string;
  userId?: string;
  role: MembershipRole;
  displayName?: string | null;
};

type ApiLease = {
  state: RoomSnapshot["driver"]["state"];
  memberId: string | null;
  leaseVersion: number;
};

function encodeCursor(roomId: string, afterSequence: number, membershipVersion: number): string {
  const payload = {
    v: 1 as const,
    roomId,
    afterSequence,
    membershipVersion,
    visibility: ["room", "approvers", "owner"],
  };
  const json = JSON.stringify(payload);
  if (typeof btoa === "function") {
    // browser / vitest: base64url
    const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return b64;
  }
  return Buffer.from(json, "utf8").toString("base64url");
}

function wsUrlFromHttp(baseUrl: string, wsPath: string): string {
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const ws = new URL(wsPath, base);
  ws.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return ws.toString();
}

type HeadersInitLike = Record<string, string> | Headers;

/**
 * Live control-plane client over fetch + WebSocket tickets.
 */
export class LiveControlPlaneClient implements ControlPlaneClient {
  readonly #baseUrl: string;
  readonly #identity: string;
  readonly #fetch: FetchLike;
  readonly #WebSocket: WsCtor;
  #sessionId: string | null;
  #sessionIdentity: SessionIdentity | null = null;
  #membershipVersion = new Map<string, number>();

  constructor(options: LiveControlPlaneClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#identity = options.identity ?? "bob:Bob";
    this.#fetch = options.fetchImpl ?? fetch;
    this.#WebSocket = options.WebSocketImpl ?? WebSocket;
    this.#sessionId = options.sessionId ?? null;
  }

  private headers(extra?: HeadersInitLike): Headers {
    const headers = new Headers(extra);
    headers.set("content-type", "application/json");
    if (this.#sessionId) {
      headers.set("authorization", `Bearer ${this.#sessionId}`);
      headers.set("x-huddle-session", this.#sessionId);
    }
    return headers;
  }

  private async ensureSession(): Promise<string> {
    if (this.#sessionId) return this.#sessionId;
    const res = await this.#fetch(`${this.#baseUrl}/v1/auth/session`, {
      method: "POST",
      headers: this.headers({ "x-huddle-user": this.#identity }),
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`auth session failed (${res.status})`);
    }
    const body = (await res.json()) as {
      session: {
        sessionId: string;
        userId: string;
        displayName: string;
      };
    };
    this.#sessionId = body.session.sessionId;
    // Member identity is room-scoped; keep a provisional session until getRoom.
    this.#sessionIdentity = {
      memberId: body.session.userId,
      displayName: body.session.displayName,
      role: "collaborator",
    };
    return this.#sessionId;
  }

  async getSession(): Promise<SessionIdentity | null> {
    await this.ensureSession();
    return this.#sessionIdentity;
  }

  async getRoom(roomId: string): Promise<RoomSnapshot> {
    await this.ensureSession();
    const res = await this.#fetch(`${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}`, {
      method: "GET",
      headers: this.headers(),
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Room unavailable (${res.status}): ${text}`);
    }
    const body = (await res.json()) as {
      room: ApiRoom;
      member: ApiMember;
      lease: ApiLease | null;
      members: ApiMember[];
    };

    this.#sessionIdentity = {
      memberId: body.member.memberId,
      displayName: body.member.displayName ?? body.member.userId ?? body.member.memberId,
      role: body.member.role,
    };
    this.#membershipVersion.set(roomId, body.room.membershipVersion ?? 1);

    const events = await this.listEvents(roomId, 0);
    const lease = body.lease;
    const driverMember = body.members.find((m) => m.memberId === lease?.memberId);

    return {
      roomId: body.room.id,
      slug: body.room.slug,
      repoName: body.room.name ?? body.room.slug,
      branch: `huddle/${body.room.slug}`,
      roomState: (body.room.state as RoomSnapshot["roomState"]) ?? "active",
      runState: "idle",
      driver: {
        state: lease?.state ?? "active",
        memberId: lease?.memberId ?? null,
        displayName: driverMember?.displayName ?? driverMember?.memberId ?? null,
        leaseVersion: lease?.leaseVersion ?? 1,
      },
      policySummary: "Approvals: network, workspace write · Worktree isolated",
      retentionUntil: "",
      members: body.members.map((m) => ({
        memberId: m.memberId,
        displayName: m.displayName ?? m.userId ?? m.memberId,
        role: m.role,
      })),
      pendingApprovals: [],
      pendingSuggestions: [],
      events,
      lastSequence: events.at(-1)?.sequence ?? body.room.lastSequence ?? 0,
    };
  }

  async listEvents(roomId: string, afterSequence: number): Promise<RoomEvent[]> {
    await this.ensureSession();
    const membershipVersion = this.#membershipVersion.get(roomId) ?? 1;
    const cursor = encodeCursor(roomId, afterSequence, membershipVersion);
    const url = new URL(`${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}/events`);
    if (afterSequence > 0) {
      url.searchParams.set("cursor", cursor);
    }
    url.searchParams.set("limitBytes", String(2 * 1024 * 1024));

    const res = await this.#fetch(url.toString(), {
      method: "GET",
      headers: this.headers(),
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`listEvents failed (${res.status}): ${text}`);
    }
    const body = (await res.json()) as { events?: RoomEvent[] };
    return body.events ?? [];
  }

  subscribe(
    roomId: string,
    afterSequence: number,
    handlers: {
      onEvent: (event: RoomEvent) => void;
      onConnection: (status: ConnectionStatus) => void;
    },
  ): () => void {
    let closed = false;
    let ws: WebSocket | null = null;
    let lastSequence = afterSequence;

    const connect = async () => {
      if (closed) return;
      handlers.onConnection("connecting");
      try {
        await this.ensureSession();
        const streamRes = await this.#fetch(
          `${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}/stream`,
          {
            method: "GET",
            headers: this.headers(),
            credentials: "include",
          },
        );
        if (!streamRes.ok) {
          handlers.onConnection("offline");
          return;
        }
        const stream = (await streamRes.json()) as { wsPath: string; highWaterMark?: number };
        if (typeof stream.highWaterMark === "number" && stream.highWaterMark > lastSequence) {
          handlers.onConnection("catching_up");
          const missed = await this.listEvents(roomId, lastSequence);
          for (const event of missed) {
            if (closed) return;
            handlers.onEvent(event);
            lastSequence = event.sequence;
          }
        }

        ws = new this.#WebSocket(wsUrlFromHttp(this.#baseUrl, stream.wsPath));
        ws.onopen = () => {
          if (!closed) handlers.onConnection("live");
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type?: string;
              event?: RoomEvent;
            };
            if (msg.type === "event" && msg.event) {
              handlers.onEvent(msg.event);
              lastSequence = msg.event.sequence;
            }
          } catch {
            // ignore malformed frames
          }
        };
        ws.onclose = () => {
          if (closed) return;
          handlers.onConnection("reconnecting");
          setTimeout(() => void connect(), 1000);
        };
        ws.onerror = () => {
          handlers.onConnection("reconnecting");
        };
      } catch {
        handlers.onConnection("offline");
      }
    };

    void connect();

    return () => {
      closed = true;
      ws?.close();
    };
  }

  async submitInput(roomId: string, request: SubmitInputRequest) {
    await this.ensureSession();
    const membershipVersion = this.#membershipVersion.get(roomId) ?? 1;
    const res = await this.#fetch(`${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}/inputs`, {
      method: "POST",
      headers: this.headers(),
      credentials: "include",
      body: JSON.stringify({
        mutationId: request.clientMutationId,
        kind: request.mode,
        text: request.text,
        expectedMembershipVersion: membershipVersion,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, message: text || `submit failed (${res.status})` };
    }
    return { ok: true as const };
  }

  async requestDriver(roomId: string) {
    await this.ensureSession();
    const membershipVersion = this.#membershipVersion.get(roomId) ?? 1;
    const res = await this.#fetch(
      `${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}/driver/request`,
      {
        method: "POST",
        headers: this.headers(),
        credentials: "include",
        body: JSON.stringify({ expectedMembershipVersion: membershipVersion }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, message: text || `driver request failed (${res.status})` };
    }
    return { ok: true as const };
  }

  async handoffDriver(roomId: string, toMemberId: string) {
    await this.ensureSession();
    const room = await this.getRoom(roomId);
    const res = await this.#fetch(
      `${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}/driver/handoff`,
      {
        method: "POST",
        headers: this.headers(),
        credentials: "include",
        body: JSON.stringify({
          toMemberId,
          expectedMembershipVersion: this.#membershipVersion.get(roomId) ?? 1,
          expectedLeaseVersion: room.driver.leaseVersion,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, message: text || `handoff failed (${res.status})` };
    }
    return { ok: true as const };
  }

  async reclaimDriver(roomId: string) {
    await this.ensureSession();
    const res = await this.#fetch(
      `${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}/driver/reclaim`,
      {
        method: "POST",
        headers: this.headers(),
        credentials: "include",
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, message: text || `reclaim failed (${res.status})` };
    }
    return { ok: true as const };
  }

  async resolveApproval(roomId: string, request: ResolveApprovalRequest) {
    await this.ensureSession();
    const membershipVersion = this.#membershipVersion.get(roomId) ?? 1;
    const res = await this.#fetch(
      `${this.#baseUrl}/v1/rooms/${encodeURIComponent(roomId)}/approvals/${encodeURIComponent(request.approvalId)}/resolve`,
      {
        method: "POST",
        headers: this.headers(),
        credentials: "include",
        body: JSON.stringify({
          decision: request.decision,
          evidenceDigest: request.evidenceDigest,
          category: "network",
          expectedMembershipVersion: membershipVersion,
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false as const, message: text || `resolve failed (${res.status})` };
    }
    return { ok: true as const };
  }
}
