import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeClock, FakeIdGenerator } from "@huddle/testkit";
import { PostgresStore } from "../postgres/store.js";

const pgUrl = process.env.HUDDLE_TEST_DATABASE_URL;
const describePg = pgUrl ? describe : describe.skip;

describePg("PostgresStore integration (HUDDLE_TEST_DATABASE_URL)", () => {
  let store: PostgresStore;
  const clock = new FakeClock();
  const ids = new FakeIdGenerator();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(() => {
    store = new PostgresStore({ connectionString: pgUrl! });
  });

  afterAll(async () => {
    await store.close();
  });

  it("upserts users and creates rooms with sequence 1", async () => {
    const userId = `pg-user-${suffix}`;
    await store.upsertUser({
      id: userId,
      displayName: "Pat",
      createdAt: clock.nowIso(),
    });
    const user = await store.getUser(userId);
    expect(user?.displayName).toBe("Pat");

    const roomId = `pg-room-${suffix}`;
    const created = await store.createRoom({
      roomId,
      slug: `pg-slug-${suffix}`,
      incarnation: `inc-${suffix}`,
      ownerUserId: userId,
      ownerMemberId: `pg-m-${suffix}`,
      nowIso: clock.nowIso(),
    });
    expect(created.event.sequence).toBe(1);

    const room = await store.getRoom(roomId);
    expect(room?.slug).toBe(`pg-slug-${suffix}`);
  });

  it("commits mutations idempotently and advances sequences", async () => {
    const userId = `pg-mut-user-${suffix}`;
    const roomId = `pg-mut-room-${suffix}`;
    const memberId = `pg-mut-m-${suffix}`;
    await store.upsertUser({ id: userId, displayName: "Morgan", createdAt: clock.nowIso() });
    await store.createRoom({
      roomId,
      slug: `pg-mut-slug-${suffix}`,
      incarnation: `inc-mut-${suffix}`,
      ownerUserId: userId,
      ownerMemberId: memberId,
      nowIso: clock.nowIso(),
    });

    const first = await store.commitMutation({
      mutationId: `mut-${suffix}-1`,
      roomId,
      nowIso: clock.nowIso(),
      requestHash: `hash-${suffix}-a`,
      auth: {
        memberId,
        role: "owner",
        capability: "room.comment",
        expectedMembershipVersion: 1,
      },
      events: [
        {
          eventId: ids.eventId(),
          type: "input.commented",
          payload: { text: "hello" },
          actor: { type: "member", id: memberId, displayName: "Morgan" },
          visibility: "room",
        },
      ],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected commit");
    expect(first.receipt.sequence).toBe(2);
    expect(first.receipt.replayed).toBe(false);

    const replay = await store.commitMutation({
      mutationId: `mut-${suffix}-1`,
      roomId,
      nowIso: clock.nowIso(),
      requestHash: `hash-${suffix}-a`,
      auth: {
        memberId,
        role: "owner",
        capability: "room.comment",
        expectedMembershipVersion: 1,
      },
      events: [
        {
          eventId: ids.eventId(),
          type: "input.commented",
          payload: { text: "hello" },
          actor: { type: "member", id: memberId, displayName: "Morgan" },
          visibility: "room",
        },
      ],
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error("expected idempotent replay");
    expect(replay.receipt.replayed).toBe(true);
    expect(replay.receipt.sequence).toBe(2);
  });

  it("creates and redeems invites", async () => {
    const userId = `pg-inv-user-${suffix}`;
    const joinerId = `pg-inv-joiner-${suffix}`;
    const roomId = `pg-inv-room-${suffix}`;
    const memberId = `pg-inv-m-${suffix}`;
    const token = `tok-${suffix}`;
    await store.upsertUser({ id: userId, displayName: "Owner", createdAt: clock.nowIso() });
    await store.upsertUser({ id: joinerId, displayName: "Joiner", createdAt: clock.nowIso() });
    await store.createRoom({
      roomId,
      slug: `pg-inv-slug-${suffix}`,
      incarnation: `inc-inv-${suffix}`,
      ownerUserId: userId,
      ownerMemberId: memberId,
      nowIso: clock.nowIso(),
    });

    const invite = await store.createInvite({
      roomId,
      inviteId: `inv-${suffix}`,
      token,
      role: "collaborator",
      createdByMemberId: memberId,
      expectedMembershipVersion: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nowIso: clock.nowIso(),
    });
    expect("error" in invite).toBe(false);
    if ("error" in invite) throw new Error(invite.error);

    const joined = await store.joinWithInvite({
      roomId,
      inviteToken: token,
      memberId: `pg-inv-join-m-${suffix}`,
      userId: joinerId,
      displayName: "Joiner",
      nowIso: clock.nowIso(),
      eventId: ids.eventId(),
    });
    expect("error" in joined).toBe(false);
  });
});
