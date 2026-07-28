import { describe, expect, it } from "vitest";
import { runCli } from "../cli.js";
import { ExitCode } from "../exit-codes.js";
import { resetDiagnosticIds } from "../errors/index.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

describe("huddle CLI golden path", () => {
  it("prints help", async () => {
    const c = capture();
    const result = await runCli({
      argv: ["--help"],
      ...c.io,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(c.stdout.join("\n")).toContain("npx huddle codex");
  });

  it("defaults to invite-only and prints a share URL", async () => {
    resetDiagnosticIds();
    const c = capture();
    const result = await runCli({
      argv: ["codex", "--non-interactive", "--no-open"],
      ...c.io,
      now: () => 1_000,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const out = c.stdout.join("\n");
    expect(out).toContain("Huddle is ready.");
    expect(out).toMatch(/Share: https:\/\/huddle\.dev\/r\/[a-z]+-[a-z]+/);
    expect(out).toContain("Access:     invite-only");
    expect(c.stderr.join("\n")).toContain("Room ready:");
  });

  it("applies --org as an explicit override", async () => {
    const c = capture();
    const result = await runCli({
      argv: ["codex", "--org", "acme", "--non-interactive", "--json"],
      ...c.io,
      now: () => 1_000,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = JSON.parse(c.stdout.join("\n")) as {
      room: { policy: string; orgSlug: string | null };
    };
    expect(payload.room.policy).toBe("org");
    expect(payload.room.orgSlug).toBe("acme");
  });

  it("honors --server for self-host escape hatch", async () => {
    const c = capture();
    const result = await runCli({
      argv: [
        "--server",
        "https://huddle.acme.internal",
        "codex",
        "--non-interactive",
        "--json",
      ],
      ...c.io,
      now: () => 1_000,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = JSON.parse(c.stdout.join("\n")) as { room: { shareUrl: string } };
    expect(payload.room.shareUrl).toMatch(/^https:\/\/huddle\.acme\.internal\/r\//);
  });

  it("rejects unknown commands with usage exit", async () => {
    const c = capture();
    const result = await runCli({
      argv: ["nope"],
      ...c.io,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.USAGE);
    expect(c.stderr.join("\n")).toContain("HUDDLE-USAGE-001");
  });
});

describe("huddle doctor", () => {
  it("emits JSON diagnostics", async () => {
    const c = capture();
    const result = await runCli({
      argv: ["doctor", "--json"],
      ...c.io,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = JSON.parse(c.stdout.join("\n")) as {
      ok: boolean;
      checks: Array<{ id: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.checks.some((c) => c.id === "codex")).toBe(true);
    expect(payload.checks.some((c) => c.id === "compatibility")).toBe(true);
  });

  it("supports targeted doctor codex", async () => {
    const c = capture();
    const result = await runCli({
      argv: ["doctor", "codex", "--json"],
      ...c.io,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = JSON.parse(c.stdout.join("\n")) as {
      target: string;
      checks: Array<{ id: string }>;
    };
    expect(payload.target).toBe("codex");
    expect(payload.checks).toHaveLength(1);
    expect(payload.checks[0]?.id).toBe("codex");
  });
});

describe("huddle diagnostics", () => {
  it("previews metadata-only bundle", async () => {
    const c = capture();
    const result = await runCli({
      argv: ["diagnostics", "create", "--non-interactive", "--json"],
      ...c.io,
      now: () => Date.parse("2026-07-28T00:00:00.000Z"),
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = JSON.parse(c.stdout.join("\n")) as {
      preview: { kind: string; excluded: string[] };
    };
    expect(payload.preview.kind).toBe("metadata-only");
    expect(payload.preview.excluded).toContain("prompts");
  });
});

describe("huddle config", () => {
  it("lists resolved config", async () => {
    const c = capture();
    const result = await runCli({
      argv: ["config", "list", "--json"],
      ...c.io,
      resetDiagnostics: true,
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const payload = JSON.parse(c.stdout.join("\n")) as {
      config: Array<{ key: string; value: string }>;
    };
    expect(payload.config.some((e) => e.key === "server")).toBe(true);
  });
});
