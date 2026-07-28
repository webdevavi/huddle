import { FakeClock, FakeIdGenerator } from "@huddle/testkit";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createDeps } from "../config.js";
import { startControlPlane } from "../server.js";

async function json(
  url: string,
  init: RequestInit & { session?: string } = {},
): Promise<{ status: number; body: unknown; session?: string }> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.session) headers.set("x-huddle-session", init.session);
  const res = await fetch(url, { ...init, headers });
  const setCookie = res.headers.get("set-cookie");
  let session = init.session;
  if (setCookie) {
    const m = /huddle_session=([^;]+)/.exec(setCookie);
    if (m?.[1]) session = decodeURIComponent(m[1]);
  }
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body, session };
}

function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

describe("control-plane HTTP + WS", () => {
  it("runs fake auth, idempotent inputs, catch-up, and stale lease rejection", async () => {
    const clock = new FakeClock();
    const ids = new FakeIdGenerator(100);
    const deps = createDeps({
      host: "127.0.0.1",
      port: 0,
      clock,
      ids,
    });
    const started = await startControlPlane(deps);
    try {
      const auth = await json(`${started.url}/v1/auth/session`, {
        method: "POST",
        headers: { "x-huddle-user": "alice:Alice" },
      });
      expect(auth.status).toBe(200);
      const session = auth.session!;

      const roomRes = await json(`${started.url}/v1/rooms`, {
        method: "POST",
        session,
        body: JSON.stringify({ slug: "ac-room", name: "AC Room" }),
      });
      expect(roomRes.status).toBe(201);
      const roomBody = rec(roomRes.body);
      const room = rec(roomBody.room);
      const lease = rec(roomBody.lease);
      const roomId = String(room.id);
      const membershipVersion = Number(room.membershipVersion);
      const leaseVersion = Number(lease.leaseVersion);

      const mutBody = {
        mutationId: "mut_comment_1",
        kind: "comment",
        text: "hello room",
        expectedMembershipVersion: membershipVersion,
      };
      const first = await json(`${started.url}/v1/rooms/${roomId}/inputs`, {
        method: "POST",
        session,
        body: JSON.stringify(mutBody),
      });
      expect(first.status).toBe(200);
      expect(rec(rec(first.body).receipt).sequence).toBe(2);
      expect(rec(rec(first.body).receipt).replayed).toBe(false);

      const replay = await json(`${started.url}/v1/rooms/${roomId}/inputs`, {
        method: "POST",
        session,
        body: JSON.stringify(mutBody),
      });
      expect(replay.status).toBe(200);
      expect(rec(rec(replay.body).receipt).replayed).toBe(true);
      expect(rec(rec(replay.body).receipt).sequence).toBe(2);

      const second = await json(`${started.url}/v1/rooms/${roomId}/inputs`, {
        method: "POST",
        session,
        body: JSON.stringify({
          mutationId: "mut_comment_2",
          kind: "comment",
          text: "second",
          expectedMembershipVersion: membershipVersion,
        }),
      });
      expect(second.status).toBe(200);
      expect(rec(rec(second.body).receipt).sequence).toBe(3);

      const catchUp = await json(`${started.url}/v1/rooms/${roomId}/events?limitBytes=1048576`, {
        method: "GET",
        session,
      });
      expect(catchUp.status).toBe(200);
      const catchEvents = rec(catchUp.body).events as Array<{ sequence: number }>;
      expect(catchEvents.map((e) => e.sequence)).toEqual([1, 2, 3]);
      expect(rec(catchUp.body).highWaterMark).toBe(3);

      const afterOne = await json(
        `${started.url}/v1/rooms/${roomId}/events?cursor=${encodeURIComponent(
          Buffer.from(
            JSON.stringify({
              v: 1,
              roomId,
              afterSequence: 1,
              membershipVersion,
              visibility: ["room", "approvers", "owner"],
            }),
          ).toString("base64url"),
        )}`,
        { method: "GET", session },
      );
      const afterEvents = rec(afterOne.body).events as Array<{ sequence: number }>;
      expect(afterEvents.map((e) => e.sequence)).toEqual([2, 3]);

      const staleLease = await json(`${started.url}/v1/rooms/${roomId}/inputs`, {
        method: "POST",
        session,
        body: JSON.stringify({
          mutationId: "mut_steer_stale",
          kind: "steer",
          text: "nope",
          expectedMembershipVersion: membershipVersion,
          expectedLeaseVersion: leaseVersion + 5,
        }),
      });
      expect(staleLease.status).toBe(409);
      expect(rec(rec(staleLease.body).error).code).toBe("AUTHZ_LEASE_STALE");

      const stream = await json(`${started.url}/v1/rooms/${roomId}/stream`, {
        method: "GET",
        session,
      });
      expect(stream.status).toBe(200);
      const wsUrl = started.url.replace("http", "ws") + String(rec(stream.body).wsPath);

      const messages: unknown[] = [];
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => reject(new Error("ws timeout")), 3000);
        ws.on("message", (data) => {
          messages.push(JSON.parse(String(data)));
          const last = messages[messages.length - 1] as { type?: string };
          if (last.type === "subscribed") {
            void json(`${started.url}/v1/rooms/${roomId}/inputs`, {
              method: "POST",
              session,
              body: JSON.stringify({
                mutationId: "mut_live",
                kind: "comment",
                text: "live",
                expectedMembershipVersion: membershipVersion,
              }),
            }).then((live) => {
              if (live.status !== 200) reject(new Error("live mutation failed"));
            });
          }
          if (last.type === "event") {
            clearTimeout(timer);
            ws.close();
            resolve();
          }
        });
        ws.on("error", reject);
      });

      expect(messages.some((m) => rec(m).type === "subscribed")).toBe(true);
      expect(
        messages.some((m) => {
          const msg = rec(m);
          const event = rec(msg.event);
          const payload = rec(event.payload);
          return msg.type === "event" && payload.text === "live";
        }),
      ).toBe(true);
    } finally {
      await started.close();
    }
  });
});
