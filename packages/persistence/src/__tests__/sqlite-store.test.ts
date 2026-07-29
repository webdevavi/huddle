import { FakeClock, FakeIdGenerator } from "@huddle/testkit";
import { describe, expect, it } from "vitest";
import {
  createPostgresStore,
  createPostgresStoreFromSqliteMirror,
  createSqliteStore,
  loadControlPlaneMigrationSql,
} from "../index.js";

describe("SqliteStore", () => {
  it("assigns monotonic sequences and replays idempotent mutations", async () => {
    const clock = new FakeClock();
    const ids = new FakeIdGenerator();
    const store = createSqliteStore();
    await store.upsertUser({ id: "u1", displayName: "Alice", createdAt: clock.nowIso() });

    const created = await store.createRoom({
      roomId: "r1",
      slug: "demo",
      incarnation: "inc1",
      ownerUserId: "u1",
      ownerMemberId: "m1",
      ownerDisplayName: "Alice",
      nowIso: clock.nowIso(),
    });
    expect(created.event.sequence).toBe(1);

    const first = await store.commitMutation({
      mutationId: "mut_1",
      roomId: "r1",
      nowIso: clock.nowIso(),
      requestHash: "hash-a",
      auth: {
        memberId: "m1",
        role: "owner",
        capability: "room.comment",
        expectedMembershipVersion: 1,
      },
      events: [
        {
          eventId: ids.eventId(),
          type: "input.commented",
          payload: { text: "hello" },
          actor: { type: "member", id: "m1", displayName: "Alice" },
          visibility: "room",
        },
      ],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected ok");
    expect(first.receipt.sequence).toBe(2);
    expect(first.receipt.replayed).toBe(false);

    const replay = await store.commitMutation({
      mutationId: "mut_1",
      roomId: "r1",
      nowIso: clock.nowIso(),
      requestHash: "hash-a",
      auth: {
        memberId: "m1",
        role: "owner",
        capability: "room.comment",
        expectedMembershipVersion: 1,
      },
      events: [
        {
          eventId: ids.eventId(),
          type: "input.commented",
          payload: { text: "hello" },
          actor: { type: "member", id: "m1", displayName: "Alice" },
          visibility: "room",
        },
      ],
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error("expected ok");
    expect(replay.receipt.replayed).toBe(true);
    expect(replay.receipt.sequence).toBe(2);
    expect(await store.getHighWaterMark("r1")).toBe(2);

    const conflict = await store.commitMutation({
      mutationId: "mut_1",
      roomId: "r1",
      nowIso: clock.nowIso(),
      requestHash: "hash-different",
      auth: {
        memberId: "m1",
        role: "owner",
        capability: "room.comment",
        expectedMembershipVersion: 1,
      },
      events: [
        {
          eventId: ids.eventId(),
          type: "input.commented",
          payload: { text: "other" },
          actor: { type: "member", id: "m1" },
          visibility: "room",
        },
      ],
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error("expected fail");
    expect(conflict.code).toBe("idempotency_conflict");
  });

  it("rejects stale driver lease on steer", async () => {
    const clock = new FakeClock();
    const store = createSqliteStore();
    await store.upsertUser({ id: "u1", displayName: "Alice", createdAt: clock.nowIso() });
    await store.createRoom({
      roomId: "r1",
      slug: "demo",
      incarnation: "inc1",
      ownerUserId: "u1",
      ownerMemberId: "m1",
      nowIso: clock.nowIso(),
    });

    const stale = await store.commitMutation({
      mutationId: "mut_steer",
      roomId: "r1",
      nowIso: clock.nowIso(),
      requestHash: "steer",
      auth: {
        memberId: "m1",
        role: "owner",
        capability: "room.steer",
        expectedMembershipVersion: 1,
        expectedLeaseVersion: 99,
      },
      events: [
        {
          eventId: "evt_steer",
          type: "input.steered",
          payload: { inputId: "in1", text: "go" },
          actor: { type: "member", id: "m1" },
          visibility: "room",
        },
      ],
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("expected fail");
    expect(stale.code).toBe("lease_invalid");
  });

  it("supports opaque catch-up after a sequence cursor", async () => {
    const clock = new FakeClock();
    const store = createSqliteStore();
    await store.upsertUser({ id: "u1", displayName: "Alice", createdAt: clock.nowIso() });
    await store.createRoom({
      roomId: "r1",
      slug: "demo",
      incarnation: "inc1",
      ownerUserId: "u1",
      ownerMemberId: "m1",
      nowIso: clock.nowIso(),
    });

    for (let i = 0; i < 3; i += 1) {
      const result = await store.commitMutation({
        mutationId: `mut_${i}`,
        roomId: "r1",
        nowIso: clock.nowIso(),
        requestHash: `h${i}`,
        auth: {
          memberId: "m1",
          role: "owner",
          capability: "room.comment",
          expectedMembershipVersion: 1,
        },
        events: [
          {
            eventId: `evt_${i}`,
            type: "input.commented",
            payload: { text: `c${i}` },
            actor: { type: "member", id: "m1" },
            visibility: "room",
          },
        ],
      });
      expect(result.ok).toBe(true);
    }

    const page = await store.getEventsAfter("r1", 1, {
      limitBytes: 1024 * 1024,
      visibility: new Set(["room", "approvers", "owner"]),
    });
    expect(page.events.map((e) => e.sequence)).toEqual([2, 3, 4]);
    expect(page.highWaterMark).toBe(4);
  });

  it("CAS-rejects stale membership version", async () => {
    const clock = new FakeClock();
    const store = createSqliteStore();
    await store.upsertUser({ id: "u1", displayName: "Alice", createdAt: clock.nowIso() });
    await store.createRoom({
      roomId: "r1",
      slug: "demo",
      incarnation: "inc1",
      ownerUserId: "u1",
      ownerMemberId: "m1",
      nowIso: clock.nowIso(),
    });

    const result = await store.commitMutation({
      mutationId: "mut_stale_mv",
      roomId: "r1",
      nowIso: clock.nowIso(),
      requestHash: "x",
      auth: {
        memberId: "m1",
        role: "owner",
        capability: "room.comment",
        expectedMembershipVersion: 0,
      },
      events: [
        {
          eventId: "evt_x",
          type: "input.commented",
          payload: { text: "nope" },
          actor: { type: "member", id: "m1" },
          visibility: "room",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.code).toBe("membership_version_mismatch");
  });
});

describe("PostgresStore", () => {
  it("createPostgresStore constructs and rejects a bad connection on first query", async () => {
    const store = createPostgresStore({
      connectionString: "postgres://invalid:invalid@127.0.0.1:1/nonexistent",
    });
    await expect(store.getUser("nobody")).rejects.toThrow();
  });

  it("createPostgresStoreFromSqliteMirror applies shared migration SQL", async () => {
    const sql = loadControlPlaneMigrationSql();
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS rooms");
    const store = createPostgresStoreFromSqliteMirror();
    await store.upsertUser({ id: "u1", displayName: "Alice", createdAt: new Date().toISOString() });
    const user = await store.getUser("u1");
    expect(user?.displayName).toBe("Alice");
  });

  const pgUrl = process.env.HUDDLE_TEST_DATABASE_URL;
  const describePg = pgUrl ? describe : describe.skip;

  describePg("integration (HUDDLE_TEST_DATABASE_URL)", () => {
    it("creates a room against real Postgres", async () => {
      const store = createPostgresStore({ connectionString: pgUrl! });
      const clock = new FakeClock();
      await store.upsertUser({ id: "pg-u1", displayName: "Pat", createdAt: clock.nowIso() });
      const created = await store.createRoom({
        roomId: `pg-r-${Date.now()}`,
        slug: `pg-slug-${Date.now()}`,
        incarnation: "inc-pg",
        ownerUserId: "pg-u1",
        ownerMemberId: "pg-m1",
        nowIso: clock.nowIso(),
      });
      expect(created.event.sequence).toBe(1);
      if ("close" in store && typeof (store as { close?: () => Promise<void> }).close === "function") {
        await (store as { close: () => Promise<void> }).close();
      }
    });
  });
});
