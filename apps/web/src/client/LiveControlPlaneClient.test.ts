import { describe, expect, it, vi } from "vitest";
import { LiveControlPlaneClient } from "./LiveControlPlaneClient.js";

describe("LiveControlPlaneClient", () => {
  it("getRoom and listEvents call control-plane HTTP routes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/auth/session") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            session: {
              sessionId: "sess_1",
              userId: "bob",
              displayName: "Bob",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/v1/rooms/room_1") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            room: {
              id: "room_1",
              slug: "quiet-sunrise",
              name: "Quiet Sunrise",
              state: "active",
              membershipVersion: 2,
              lastSequence: 1,
            },
            member: {
              memberId: "member_bob",
              userId: "bob",
              role: "collaborator",
              displayName: "Bob",
            },
            lease: {
              state: "active",
              memberId: "member_alice",
              leaseVersion: 3,
            },
            members: [
              {
                memberId: "member_alice",
                userId: "alice",
                role: "owner",
                displayName: "Alice",
              },
              {
                memberId: "member_bob",
                userId: "bob",
                role: "collaborator",
                displayName: "Bob",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/v1/rooms/room_1/events")) {
        const parsed = new URL(url);
        const hasCursor = parsed.searchParams.has("cursor");
        return new Response(
          JSON.stringify({
            events: hasCursor
              ? []
              : [
                  {
                    schemaVersion: 1,
                    eventId: "evt_1",
                    roomId: "room_1",
                    roomIncarnation: "inc_1",
                    sequence: 1,
                    timestamp: "2026-07-28T00:00:00.000Z",
                    visibility: "room",
                    actor: { type: "system", id: "system" },
                    type: "room.created",
                    payload: { slug: "quiet-sunrise", name: "Quiet Sunrise" },
                  },
                ],
            highWaterMark: 1,
            truncated: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });

    const client = new LiveControlPlaneClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const room = await client.getRoom("room_1");
    expect(room.roomId).toBe("room_1");
    expect(room.slug).toBe("quiet-sunrise");
    expect(room.driver.memberId).toBe("member_alice");
    expect(room.events).toHaveLength(1);
    expect(room.lastSequence).toBe(1);

    const more = await client.listEvents("room_1", 1);
    expect(more).toEqual([]);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith("/v1/auth/session"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/v1/rooms/room_1"))).toBe(true);
    expect(urls.some((u) => u.includes("/v1/rooms/room_1/events"))).toBe(true);
  });
});
