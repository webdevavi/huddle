import { describe, expect, it } from "vitest";
import {
  CodexAdapter,
  CodexIncompatibleError,
  FakeCodexServer,
  SUPPORTED_CODEX_APP_SERVER,
  detectCodexCompatibility,
  loadFixtureManifest,
  loadFixtureMessages,
  pinnedSchemaInfo,
  translateCodexMessage,
} from "../index.js";

describe("codex version detection", () => {
  it("accepts the pinned fixture version", () => {
    const result = detectCodexCompatibility(SUPPORTED_CODEX_APP_SERVER.pinned, "diag-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schemaFingerprint).toBe(SUPPORTED_CODEX_APP_SERVER.schemaFingerprint);
    }
  });

  it("rejects incompatible binaries with repair guidance", () => {
    const result = detectCodexCompatibility("0.40.0", "diag-2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROVIDER_INCOMPATIBLE");
      expect(result.error.message).toContain("Install a compatible Codex binary");
      expect(result.error.message).toContain(SUPPORTED_CODEX_APP_SERVER.pinned);
    }
  });

  it("throws CodexIncompatibleError when constructing adapter with bad version", () => {
    expect(() => new CodexAdapter({ version: "9.9.9", diagnosticId: "diag-3" })).toThrow(
      CodexIncompatibleError,
    );
  });
});

describe("pinned fixtures", () => {
  it("manifest declares pin and fingerprint", () => {
    const manifest = loadFixtureManifest();
    expect(manifest.version).toBe(SUPPORTED_CODEX_APP_SERVER.pinned);
    expect(manifest.schemaFingerprint).toBe(SUPPORTED_CODEX_APP_SERVER.schemaFingerprint);
    expect(pinnedSchemaInfo().schemaFingerprint).toBe(manifest.schemaFingerprint);
  });

  it("translates turn-start fixture into huddle events", () => {
    const messages = loadFixtureMessages("turn-start.jsonl");
    const events = messages
      .map((m) => translateCodexMessage(m))
      .filter((r) => r.kind === "event");
    expect(events.some((e) => e.kind === "event" && e.event.type === "run.started")).toBe(true);
    expect(
      events.some((e) => e.kind === "event" && e.event.type === "agent.message_completed"),
    ).toBe(true);
    expect(
      events.some((e) => e.kind === "event" && e.event.type === "agent.command_started"),
    ).toBe(true);
    expect(events.some((e) => e.kind === "event" && e.event.type === "run.completed")).toBe(true);
  });

  it("surfaces approval requests from fixtures", () => {
    const messages = loadFixtureMessages("approval-exec.jsonl");
    const result = translateCodexMessage(messages[0]!);
    expect(result.kind).toBe("approval_request");
    if (result.kind === "approval_request") {
      expect(result.approval.category).toBe("network");
      expect(result.approval.command).toContain("curl");
    }
  });

  it("quarantines unknown methods", () => {
    const messages = loadFixtureMessages("unknown-method.jsonl");
    const result = translateCodexMessage(messages[0]!);
    expect(result.kind).toBe("quarantine");
    if (result.kind === "quarantine") {
      expect(result.method).toBe("experimental/unknownThing");
    }
  });
});

describe("fake Codex App Server", () => {
  it("completes initialize and turn handshake", () => {
    const fake = new FakeCodexServer();
    const adapter = new CodexAdapter({ version: fake.version });

    const translated: string[] = [];
    adapter.on("message", (msg) => {
      if (msg.kind === "event") translated.push(msg.event.type);
    });

    fake.pushClientMessage(adapter.encode(adapter.buildInitializeRequest()));
    for (const line of fake.drainOutbound()) {
      adapter.pushInbound(line);
    }

    fake.pushClientMessage(
      adapter.encode({
        method: "thread/start",
        id: adapter.allocateId(),
        params: {},
      }),
    );
    for (const line of fake.drainOutbound()) {
      adapter.pushInbound(line);
    }

    fake.pushClientMessage(adapter.encode(adapter.buildTurnStart("thr_1", "say hi")));
    for (const line of fake.drainOutbound()) {
      adapter.pushInbound(line);
    }

    expect(translated).toContain("run.started");
    expect(translated).toContain("agent.message_completed");
    expect(translated).toContain("run.completed");
  });

  it("emits approval request for network commands", () => {
    const fake = new FakeCodexServer();
    const adapter = new CodexAdapter({ version: fake.version });
    const approvals: string[] = [];
    adapter.on("message", (msg) => {
      if (msg.kind === "approval_request") approvals.push(msg.approval.category);
    });

    fake.pushClientMessage(adapter.encode(adapter.buildTurnStart("thr_1", "curl https://x")));
    for (const line of fake.drainOutbound()) {
      adapter.pushInbound(line);
    }

    expect(approvals).toEqual(["network"]);
  });
});
