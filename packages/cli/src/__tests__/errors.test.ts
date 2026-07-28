import { describe, expect, it } from "vitest";
import { DX_CATALOG, createDxError, renderDxError, resetDiagnosticIds } from "../errors/index.js";
import { ExitCode } from "../exit-codes.js";

describe("DX error catalog", () => {
  it("covers required HUDDLE-*-NNN entries", () => {
    expect(DX_CATALOG["HUDDLE-CODEX-001"].exitCode).toBe(ExitCode.PROVIDER);
    expect(DX_CATALOG["HUDDLE-AUTH-003"].exitCode).toBe(ExitCode.AUTHENTICATION);
    expect(DX_CATALOG["HUDDLE-STORAGE-002"].exitCode).toBe(ExitCode.STORAGE);
  });

  it("renders actionable text without leaking unsafe fields by default", () => {
    resetDiagnosticIds();
    const error = createDxError("HUDDLE-CODEX-001", {
      details: { found: "0.144.0", supported: "0.145.x", path: "/usr/local/bin/codex", secret: "nope" },
      diagnosticId: "hd_TEST",
    });
    const text = renderDxError(error, { json: false, verbose: false, color: false });
    expect(text).toContain("HUDDLE-CODEX-001");
    expect(text).toContain("Found:");
    expect(text).toContain("huddle doctor codex");
    expect(text).not.toContain("nope");
  });
});
