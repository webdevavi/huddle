#!/usr/bin/env node
/**
 * Local end-to-end smoke against a control plane.
 *
 * Env:
 *   HUDDLE_E2E_URL=http://127.0.0.1:8787 (default)
 *   HUDDLE_E2E_BOOT=1|0  auto-start control plane when healthz is down
 *                        (default: on when CI=true or server unreachable)
 *
 * Covers: auth mode, Alice create+invite, Bob join, comment/suggest,
 * driver request/handoff/reclaim, runner ingest, HTTP catch-up, WS stream,
 * approval resolve, archive.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const BASE = (process.env.HUDDLE_E2E_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {string[]} */
const steps = [];
let failed = false;
/** @type {import("node:child_process").ChildProcess | null} */
let bootChild = null;

function ok(name, detail = "") {
  steps.push(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, err) {
  failed = true;
  const msg = err instanceof Error ? err.message : String(err);
  steps.push(`FAIL  ${name} — ${msg}`);
  console.error(`✗ ${name} — ${msg}`);
}

async function json(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { res, body };
}

async function auth(identity) {
  const { res, body } = await json("/v1/auth/session", {
    method: "POST",
    headers: { "x-huddle-user": identity },
  });
  if (!res.ok || !body?.session?.sessionId) {
    throw new Error(`auth failed for ${identity}: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.session;
}

function sessionHeaders(session) {
  return {
    authorization: `Bearer ${session.sessionId}`,
    "x-huddle-session": session.sessionId,
  };
}

function encodeCursor(roomId, afterSequence, membershipVersion) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      roomId,
      afterSequence,
      membershipVersion,
      visibility: ["room", "approvers", "owner"],
    }),
    "utf8",
  ).toString("base64url");
}

async function waitForWsEvent(wsUrl, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("websocket timeout"));
    }, timeoutMs);
    /** @type {unknown[]} */
    const messages = [];
    ws.on("message", (data) => {
      try {
        messages.push(JSON.parse(String(data)));
      } catch {
        messages.push(String(data));
      }
      const last = messages[messages.length - 1];
      if (last && typeof last === "object" && last !== null && "type" in last) {
        if (last.type === "event" || (last.type === "subscribed" && messages.length > 1)) {
          // keep collecting briefly
        }
      }
    });
    ws.on("open", () => {
      // server pushes subscribed then events
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    // Resolve after short window once subscribed
    const check = setInterval(() => {
      const sub = messages.find((m) => m && typeof m === "object" && m.type === "subscribed");
      if (sub) {
        clearInterval(check);
        clearTimeout(timer);
        setTimeout(() => {
          ws.close();
          resolve(messages);
        }, 200);
      }
    }, 50);
  });
}

async function healthOk() {
  try {
    const health = await json("/healthz");
    return health.res.ok && health.body?.ok === true;
  } catch {
    return false;
  }
}

function shouldAutoBoot() {
  const flag = process.env.HUDDLE_E2E_BOOT?.trim();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return process.env.CI === "true" || process.env.CI === "1";
}

async function ensureControlPlane() {
  if (await healthOk()) return;

  if (!shouldAutoBoot()) {
    throw new Error(
      `control plane not reachable at ${BASE}; start it or set HUDDLE_E2E_BOOT=1`,
    );
  }

  const url = new URL(BASE);
  const host = url.hostname || "127.0.0.1";
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const sqlitePath = process.env.HUDDLE_SQLITE_PATH ?? join(ROOT, ".huddle", "e2e.db");
  mkdirSync(dirname(sqlitePath), { recursive: true });

  console.log(`Booting control plane on ${host}:${port}…`);
  const cliJs = join(ROOT, "apps/control-plane/dist/cli.js");
  const cliTs = join(ROOT, "apps/control-plane/src/cli.ts");
  /** @type {string[]} */
  let args;
  try {
    const { accessSync, constants } = await import("node:fs");
    accessSync(cliJs, constants.R_OK);
    args = [cliJs];
  } catch {
    // Fall back to tsx for contributor runs without a prior typecheck build.
    args = ["--import", "tsx/esm", cliTs];
  }

  bootChild = spawn(process.execPath, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      HUDDLE_HOST: host,
      HUDDLE_PORT: String(port),
      HUDDLE_SQLITE_PATH: sqlitePath,
      HUDDLE_BASE_URL: BASE,
      HUDDLE_TELEMETRY: "off",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  bootChild.stdout?.on("data", (chunk) => {
    if (process.env.HUDDLE_E2E_VERBOSE === "1") process.stdout.write(chunk);
  });
  bootChild.stderr?.on("data", (chunk) => {
    if (process.env.HUDDLE_E2E_VERBOSE === "1") process.stderr.write(chunk);
  });
  bootChild.on("exit", (code, signal) => {
    if (!failed && code && code !== 0) {
      console.error(`control plane exited early (code=${code}, signal=${signal})`);
    }
    bootChild = null;
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (bootChild?.exitCode != null) {
      throw new Error(`control plane exited before ready (code=${bootChild.exitCode})`);
    }
    if (await healthOk()) {
      ok("boot control plane", `${BASE}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${BASE}/healthz after boot`);
}

function stopBootedControlPlane() {
  if (!bootChild || bootChild.killed) return;
  try {
    bootChild.kill("SIGTERM");
  } catch {
    // ignore
  }
  bootChild = null;
}

async function main() {
  console.log(`Huddle local E2E → ${BASE}\n`);

  try {
    await ensureControlPlane();
  } catch (e) {
    fail("boot control plane", e);
    process.exit(1);
  }

  // 1. health + auth mode
  try {
    const health = await json("/healthz");
    if (!health.res.ok || health.body?.ok !== true) throw new Error(JSON.stringify(health.body));
    ok("healthz");
  } catch (e) {
    fail("healthz", e);
    stopBootedControlPlane();
    process.exit(1);
  }

  try {
    const mode = await json("/v1/auth/mode");
    if (!mode.res.ok || !mode.body?.mode) throw new Error(JSON.stringify(mode.body));
    ok("auth mode", mode.body.mode);
  } catch (e) {
    fail("auth mode", e);
  }

  // 2. Alice creates room + invite
  let alice;
  let roomId;
  let slug;
  let inviteToken;
  let membershipVersion = 1;
  let leaseVersion = 1;
  try {
    alice = await auth("alice:Alice");
    ok("alice auth", alice.userId);

    const created = await json("/v1/rooms", {
      method: "POST",
      headers: sessionHeaders(alice),
      body: JSON.stringify({ slug: `e2e-${Date.now().toString(36)}`, name: "E2E Room" }),
    });
    if (!created.res.ok) throw new Error(JSON.stringify(created.body));
    roomId = created.body.room.id;
    slug = created.body.room.slug;
    membershipVersion = created.body.room.membershipVersion;
    leaseVersion = created.body.lease?.leaseVersion ?? 1;
    ok("create room", `${slug} (${roomId})`);

    const invite = await json(`/v1/rooms/${roomId}/invites`, {
      method: "POST",
      headers: sessionHeaders(alice),
      body: JSON.stringify({ role: "collaborator", expectedMembershipVersion: membershipVersion }),
    });
    if (!invite.res.ok) throw new Error(JSON.stringify(invite.body));
    inviteToken = invite.body.invite.token;
    membershipVersion = invite.body.invite ? membershipVersion : membershipVersion;
    // invite create may bump membership version — refresh room
    const snap = await json(`/v1/rooms/${roomId}`, { headers: sessionHeaders(alice) });
    membershipVersion = snap.body.room.membershipVersion;
    leaseVersion = snap.body.lease?.leaseVersion ?? leaseVersion;
    ok("create invite", inviteToken.slice(0, 8) + "…");
  } catch (e) {
    fail("alice create/invite", e);
    process.exit(1);
  }

  // 3. Bob joins
  let bob;
  let bobMemberId;
  try {
    bob = await auth("bob:Bob");
    const joined = await json(`/v1/rooms/${roomId}/join`, {
      method: "POST",
      headers: sessionHeaders(bob),
      body: JSON.stringify({ token: inviteToken }),
    });
    if (!joined.res.ok) throw new Error(JSON.stringify(joined.body));
    bobMemberId = joined.body.member.memberId;
    membershipVersion = joined.body.room.membershipVersion;
    ok("bob join", bobMemberId);
  } catch (e) {
    fail("bob join", e);
    process.exit(1);
  }

  // 4. Comment + suggest
  try {
    const comment = await json(`/v1/rooms/${roomId}/inputs`, {
      method: "POST",
      headers: sessionHeaders(bob),
      body: JSON.stringify({
        mutationId: randomUUID(),
        kind: "comment",
        text: "timezone edge case?",
      }),
    });
    if (!comment.res.ok) throw new Error(JSON.stringify(comment.body));
    ok("bob comment");

    const suggest = await json(`/v1/rooms/${roomId}/inputs`, {
      method: "POST",
      headers: sessionHeaders(bob),
      body: JSON.stringify({
        mutationId: randomUUID(),
        kind: "suggest",
        text: "Check DST conversion in parseDate",
      }),
    });
    if (!suggest.res.ok) throw new Error(JSON.stringify(suggest.body));
    ok("bob suggest");
  } catch (e) {
    fail("inputs", e);
  }

  // 5. Driver request / handoff / reclaim
  try {
    const req = await json(`/v1/rooms/${roomId}/driver/request`, {
      method: "POST",
      headers: sessionHeaders(bob),
      body: JSON.stringify({ mutationId: randomUUID() }),
    });
    if (!req.res.ok) throw new Error(JSON.stringify(req.body));
    ok("bob driver request");

    const handoff = await json(`/v1/rooms/${roomId}/driver/handoff`, {
      method: "POST",
      headers: sessionHeaders(alice),
      body: JSON.stringify({
        mutationId: randomUUID(),
        toMemberId: bobMemberId,
        expectedLeaseVersion: leaseVersion,
      }),
    });
    if (!handoff.res.ok) throw new Error(JSON.stringify(handoff.body));
    leaseVersion = handoff.body.lease?.leaseVersion ?? leaseVersion + 1;
    ok("alice handoff to bob", `lease v${leaseVersion}`);

    const reclaim = await json(`/v1/rooms/${roomId}/driver/reclaim`, {
      method: "POST",
      headers: sessionHeaders(alice),
      body: JSON.stringify({
        mutationId: randomUUID(),
        expectedLeaseVersion: leaseVersion,
      }),
    });
    if (!reclaim.res.ok) throw new Error(JSON.stringify(reclaim.body));
    leaseVersion = reclaim.body.lease?.leaseVersion ?? leaseVersion + 1;
    ok("alice reclaim", `lease v${leaseVersion}`);
  } catch (e) {
    fail("driver flow", e);
  }

  // 6. Runner connect + ingest
  let runnerEpoch;
  try {
    const snap = await json(`/v1/rooms/${roomId}`, { headers: sessionHeaders(alice) });
    const expectedEpoch = snap.body.room.runnerEpoch ?? 0;
    const connect = await json(
      `/v1/runner/connect?roomId=${encodeURIComponent(roomId)}&expectedEpoch=${expectedEpoch}`,
      { headers: sessionHeaders(alice) },
    );
    if (!connect.res.ok) throw new Error(JSON.stringify(connect.body));
    runnerEpoch = connect.body.runnerEpoch;
    ok("runner connect", `epoch ${runnerEpoch}`);

    const eventId = randomUUID();
    const ingest = await json(`/v1/rooms/${roomId}/runner/ingest`, {
      method: "POST",
      headers: sessionHeaders(alice),
      body: JSON.stringify({
        roomIncarnation: snap.body.room.incarnation,
        runnerEpoch,
        recordId: randomUUID(),
        events: [
          {
            eventId,
            type: "agent.message_completed",
            actor: { type: "agent", id: "codex" },
            payload: { text: "Diagnosed failing test", turnId: "t1" },
            visibility: "room",
          },
        ],
      }),
    });
    if (!ingest.res.ok) throw new Error(JSON.stringify(ingest.body));
    ok("runner ingest", ingest.body.lastAckedRecordId ?? ingest.body.serverCursor);
  } catch (e) {
    fail("runner connect/ingest", e);
  }

  // 7. HTTP catch-up
  try {
    const cursor = encodeCursor(roomId, 0, membershipVersion);
    const events = await json(
      `/v1/rooms/${roomId}/events?cursor=${encodeURIComponent(cursor)}&limitBytes=1048576`,
      { headers: sessionHeaders(bob) },
    );
    if (!events.res.ok) throw new Error(JSON.stringify(events.body));
    const count = events.body.events?.length ?? events.body.page?.events?.length ?? 0;
    if (count < 1) throw new Error(`expected events, got ${JSON.stringify(events.body)}`);
    ok("http catch-up", `${count} events`);
  } catch (e) {
    fail("http catch-up", e);
  }

  // 8. WebSocket stream
  try {
    const stream = await json(`/v1/rooms/${roomId}/stream`, {
      headers: sessionHeaders(bob),
    });
    if (!stream.res.ok) throw new Error(JSON.stringify(stream.body));
    const wsPath = stream.body.wsPath;
    if (!wsPath) throw new Error("missing wsPath");
    const wsUrl = new URL(wsPath, BASE);
    wsUrl.protocol = BASE.startsWith("https") ? "wss:" : "ws:";
    const messages = await waitForWsEvent(wsUrl.toString());
    const sub = messages.find((m) => m?.type === "subscribed");
    if (!sub) throw new Error(`no subscribed message: ${JSON.stringify(messages)}`);
    ok("websocket stream", `subscribed highWater=${sub.highWaterMark ?? "?"}`);
  } catch (e) {
    fail("websocket stream", e);
  }

  // 9. Approval resolve (CP record; crypto verified on runner side)
  try {
    const approvalId = randomUUID();
    const resolve = await json(`/v1/rooms/${roomId}/approvals/${approvalId}/resolve`, {
      method: "POST",
      headers: sessionHeaders(alice),
      body: JSON.stringify({
        mutationId: randomUUID(),
        decision: "allow",
        category: "network",
        evidenceDigest: "sha256:deadbeef",
        expectedMembershipVersion: membershipVersion,
      }),
    });
    if (!resolve.res.ok) throw new Error(JSON.stringify(resolve.body));
    ok("approval resolve");
  } catch (e) {
    fail("approval resolve", e);
  }

  // 10. Archive
  try {
    const arch = await json(`/v1/rooms/${roomId}/archive`, {
      method: "POST",
      headers: sessionHeaders(alice),
      body: JSON.stringify({ mutationId: randomUUID() }),
    });
    if (!arch.res.ok) throw new Error(JSON.stringify(arch.body));
    ok("archive room");
  } catch (e) {
    fail("archive room", e);
  }

  console.log("\n—— summary ——");
  for (const line of steps) console.log(line);
  stopBootedControlPlane();
  if (failed) {
    console.error("\nE2E FAILED");
    process.exit(1);
  }
  console.log("\nE2E PASSED");
}

process.on("exit", stopBootedControlPlane);
process.on("SIGINT", () => {
  stopBootedControlPlane();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopBootedControlPlane();
  process.exit(143);
});

main().catch((err) => {
  console.error(err);
  stopBootedControlPlane();
  process.exit(1);
});
