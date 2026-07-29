import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  FaultyFsPort,
  FramedWal,
  NodeFsPort,
  StorageUnavailableError,
  assertRunnerEpoch,
  assertPathInsideRoot,
  encodeRecordFrame,
  recoverSegment,
  rejectWorkspaceEscape,
  roomWalDir,
  verifyApprovalEvidence,
  redactAndClassify,
  syncOutbound,
  FakeOutboundSyncClient,
  startRunnerCore,
  type RunnerFence,
} from "../index.js";
import {
  StubEvidenceDigester,
  type ApprovalVerifier,
  type SignedApprovalEvidence,
  type VerifyContext,
  type VerifyResult,
} from "@huddle/authz";
import { SUPPORTED_CODEX_APP_SERVER } from "@huddle/codex-adapter";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function tempEnv(): Promise<{ dir: string; env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), "huddle-runner-"));
  temps.push(dir);
  return { dir, env: { ...process.env, HUDDLE_HOME: dir } };
}

function fence(epoch = 1): RunnerFence {
  return { roomIncarnation: "inc-1", runnerEpoch: epoch };
}

describe("runner epoch fencing", () => {
  it("rejects stale epochs", () => {
    const result = assertRunnerEpoch(fence(2), fence(1), "diag");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RUNNER_EPOCH_STALE");
    }
  });

  it("WAL append rejects stale epoch", async () => {
    const { env } = await tempEnv();
    const fs = new NodeFsPort();
    const opened = await FramedWal.open("room-a", fence(1), fs, env);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const stale = await opened.wal.append(
      { recordId: "r1", recordType: "heartbeat", body: {} },
      fence(0),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.code).toBe("RUNNER_EPOCH_STALE");
    }
  });
});

describe("framed WAL recovery", () => {
  it("recovers after crash by truncating corrupt tail", async () => {
    const { env, dir } = await tempEnv();
    const fs = new NodeFsPort();
    const opened = await FramedWal.open("room-b", fence(1), fs, env);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await opened.wal.append(
      { recordId: "rec-1", recordType: "mutation_intent", body: { n: 1 } },
      fence(1),
    );
    await opened.wal.append(
      { recordId: "rec-2", recordType: "effect", body: { n: 2 } },
      fence(1),
    );

    const walPath = join(roomWalDir("room-b", env), "segment-0001.wal");
    const existing = await fs.readFile(walPath);
    await fs.appendFile(walPath, Buffer.from("HWAL\x00\x00\x00\xffCORRUPT"));

    const reopened = await FramedWal.open("room-b", fence(1), fs, env);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.wal.records.map((r) => r.recordId)).toEqual(["rec-1", "rec-2"]);

    const recoveredBuf = await fs.readFile(walPath);
    expect(recoveredBuf.length).toBeLessThanOrEqual(existing.length + 64);
    expect(walPath.startsWith(dir)).toBe(true);
  });

  it("recoverSegment truncates incomplete tail frames", () => {
    const record = encodeRecordFrame({
      recordId: "r1",
      recordType: "heartbeat",
      roomIncarnation: "inc",
      runnerEpoch: 1,
      body: {},
    });
    const truncated = Buffer.concat([record, Buffer.from([0x00, 0x01, 0x02])]);
    const result = recoverSegment(truncated);
    expect(result.frames).toHaveLength(1);
    expect(result.truncatedBytes).toBe(3);
    expect(result.failClosed).toBe(false);
  });

  it("disables execution on injectable ENOSPC", async () => {
    const { env } = await tempEnv();
    const inner = new NodeFsPort();
    const fs = new FaultyFsPort(inner, { writesUntilFail: 3, failCode: "ENOSPC" });
    const opened = await FramedWal.open("room-c", fence(1), fs, env);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await expect(
      opened.wal.append(
        { recordId: "rec-enospc", recordType: "mutation_intent", body: {} },
        fence(1),
      ),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(opened.wal.disabled).toBe(true);
  });

  it("basic compaction drops acked prefix", async () => {
    const { env } = await tempEnv();
    const fs = new NodeFsPort();
    const opened = await FramedWal.open("room-d", fence(1), fs, env);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await opened.wal.append(
      { recordId: "a", recordType: "mutation_intent", body: {} },
      fence(1),
    );
    await opened.wal.append({ recordId: "b", recordType: "effect", body: {} }, fence(1));
    await opened.wal.acknowledgeServer("a");
    await opened.wal.compact();
    expect(opened.wal.records.map((r) => r.recordId)).toEqual(["b"]);
  });
});

describe("workspace path escape", () => {
  it("rejects .. traversal and symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "huddle-wt-"));
    temps.push(root);
    const inside = join(root, "src");
    await mkdir(inside);
    await writeFile(join(inside, "ok.txt"), "ok");

    const outside = await mkdtemp(join(tmpdir(), "huddle-outside-"));
    temps.push(outside);
    await writeFile(join(outside, "secret.txt"), "nope");

    const link = join(root, "leak");
    await symlink(outside, link);

    const fs = new NodeFsPort();

    const traversal = await assertPathInsideRoot(root, "../nope", fs);
    expect(traversal.ok).toBe(false);

    const absEscape = await assertPathInsideRoot(root, outside, fs);
    expect(absEscape.ok).toBe(false);

    const symlinkEscape = await assertPathInsideRoot(root, join("leak", "secret.txt"), fs);
    expect(symlinkEscape.ok).toBe(false);

    const ok = await rejectWorkspaceEscape(root, ["src/ok.txt"], fs);
    expect(ok.ok).toBe(true);
  });
});

describe("approval evidence hooks", () => {
  /** Test-only verifier — not shipped in @huddle/authz. */
  class TestApprovalVerifier implements ApprovalVerifier {
    verify(evidence: SignedApprovalEvidence, context: VerifyContext): VerifyResult {
      if (evidence.roomIncarnation !== context.roomIncarnation) {
        return { ok: false, reason: "wrong_room" };
      }
      if (evidence.runnerEpoch !== context.runnerEpoch) {
        return { ok: false, reason: "stale_epoch" };
      }
      if (evidence.requestNonce !== context.expectedNonce) {
        return { ok: false, reason: "nonce_mismatch" };
      }
      if (context.consumedNonces.has(evidence.requestNonce)) {
        return { ok: false, reason: "nonce_replay" };
      }
      if (
        evidence.evidenceDigest.algorithm !== context.expectedDigest.algorithm ||
        evidence.evidenceDigest.hex !== context.expectedDigest.hex
      ) {
        return { ok: false, reason: "digest_mismatch" };
      }
      if (Date.parse(context.nowIso) > Date.parse(evidence.expiresAt)) {
        return { ok: false, reason: "expired" };
      }
      if (evidence.signature !== "test-ok") {
        return { ok: false, reason: "bad_signature" };
      }
      return { ok: true };
    }
  }

  it("wires verifier call sites and fails closed on stub crypto", () => {
    const digester = new StubEvidenceDigester();
    const material = { category: "network", command: "curl x", raw: { command: "curl x" } };
    const digest = digester.digest(material);
    const evidence: SignedApprovalEvidence = {
      roomIncarnation: "inc-1",
      runnerEpoch: 1,
      requestNonce: "n1",
      evidenceDigest: digest,
      decision: "allow",
      expiresAt: "2026-07-28T01:00:00.000Z",
      membershipVersion: 1,
      capabilityGrant: { memberId: "m1", categories: ["network"], membershipVersion: 1 },
      signerPublicKey: "pk",
      signature: "sig",
    };

    const stubbed = verifyApprovalEvidence({
      fence: fence(1),
      expectedFence: fence(1),
      evidence,
      material,
      expectedNonce: "n1",
      nowIso: "2026-07-28T00:00:00.000Z",
      consumedNonces: new Set(),
    });
    expect(stubbed.ok).toBe(false);
    if (!stubbed.ok) {
      expect(stubbed.error.code).toBe("AUTHZ_APPROVAL_UNSUPPORTED");
    }
  });

  it("allows with test-only ApprovalVerifier", () => {
    const digester = new StubEvidenceDigester();
    const material = { category: "network", command: "curl x", raw: { command: "curl x" } };
    const digest = digester.digest(material);
    const evidence: SignedApprovalEvidence = {
      roomIncarnation: "inc-1",
      runnerEpoch: 1,
      requestNonce: "n2",
      evidenceDigest: digest,
      decision: "allow",
      expiresAt: "2026-07-28T01:00:00.000Z",
      membershipVersion: 1,
      capabilityGrant: { memberId: "m1", categories: ["network"], membershipVersion: 1 },
      signerPublicKey: "pk",
      signature: "test-ok",
    };

    const allowed = verifyApprovalEvidence(
      {
        fence: fence(1),
        expectedFence: fence(1),
        evidence,
        material,
        expectedNonce: "n2",
        nowIso: "2026-07-28T00:00:00.000Z",
        consumedNonces: new Set(),
      },
      { digester, verifier: new TestApprovalVerifier() },
    );
    expect(allowed.ok).toBe(true);
  });

  it("rejects evidence bound to a stale epoch", () => {
    const digester = new StubEvidenceDigester();
    const material = { category: "network", raw: {} };
    const digest = digester.digest(material);
    const evidence: SignedApprovalEvidence = {
      roomIncarnation: "inc-1",
      runnerEpoch: 1,
      requestNonce: "n3",
      evidenceDigest: digest,
      decision: "allow",
      expiresAt: "2026-07-28T01:00:00.000Z",
      membershipVersion: 1,
      capabilityGrant: { memberId: "m1", categories: ["network"], membershipVersion: 1 },
      signerPublicKey: "pk",
      signature: "test-ok",
    };

    const result = verifyApprovalEvidence(
      {
        fence: fence(1),
        expectedFence: fence(2),
        evidence,
        material,
        expectedNonce: "n3",
        nowIso: "2026-07-28T00:00:00.000Z",
        consumedNonces: new Set(),
      },
      { digester, verifier: new TestApprovalVerifier() },
    );
    expect(result.ok).toBe(false);
  });
});

describe("redaction and sync", () => {
  it("redacts tokens and credential URLs", () => {
    const result = redactAndClassify(
      "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789 and url=https://user:pass@host/x",
    );
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("ghp_");
    expect(result.text).not.toContain("user:pass");
  });

  it("syncOutbound rejects stale epoch", async () => {
    const client = new FakeOutboundSyncClient();
    const result = await syncOutbound(client, fence(2), {
      fence: fence(1),
      recordId: "r1",
      events: [],
    });
    expect(result).toEqual({ ok: false, reason: "stale_epoch" });
    expect(client.ingested).toHaveLength(0);
  });
});

describe("startRunnerCore integration", () => {
  it("boots with pinned codex version and journals durable records", async () => {
    const { env } = await tempEnv();
    const runner = await startRunnerCore({
      roomId: "room-int",
      fence: fence(1),
      codexVersion: SUPPORTED_CODEX_APP_SERVER.pinned,
      env,
    });

    await runner.appendDurable("mut-1", "mutation_intent", { hello: true });
    expect(runner.wal.records.some((r) => r.recordId === "mut-1")).toBe(true);
    await runner.close();
  });
});

describe("ENG-T6 workspace hardening", () => {
  it("sanitizes env and disables git hooks path", async () => {
    const { sanitizeRunnerEnv } = await import("../env.js");
    const clean = sanitizeRunnerEnv({
      HOME: "/home/u",
      PATH: "/usr/bin",
      NODE_OPTIONS: "--inspect",
      GIT_TRACE: "1",
      HUDDLE_SERVER: "http://localhost",
      SECRET_TOKEN: "nope",
    });
    expect(clean.NODE_OPTIONS).toBeUndefined();
    expect(clean.GIT_TRACE).toBeUndefined();
    expect(clean.SECRET_TOKEN).toBeUndefined();
    expect(clean.HUDDLE_SERVER).toBe("http://localhost");
    expect(clean.GIT_CONFIG_VALUE_0).toBe("/dev/null");
  });

  it("rejects executables from the worktree PATH", async () => {
    const { resolveExecutable } = await import("../executable.js");
    const { dir } = await tempEnv();
    const bin = join(dir, "evil-bin");
    await writeFile(bin, "#!/bin/sh\necho hi\n", { mode: 0o755 });
    const result = resolveExecutable("evil-bin", {
      pathEnv: dir,
      worktreeRoot: dir,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("flags .gitmodules without explicit policy", async () => {
    const { assertSubmodulePolicy } = await import("../submodule.js");
    const { dir } = await tempEnv();
    const fs = new NodeFsPort();
    await writeFile(join(dir, ".gitmodules"), "[submodule \"x\"]\n");
    const blocked = await assertSubmodulePolicy(dir, fs);
    expect(blocked.ok).toBe(false);
    const allowed = await assertSubmodulePolicy(dir, fs, { allowInitializedReadOnly: true });
    expect(allowed.ok).toBe(true);
  });
});
