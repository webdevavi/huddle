import { describe, expect, it } from "vitest";
import { parseArgs } from "../parse-args.js";

describe("parseArgs", () => {
  it("parses global flags before command", () => {
    const parsed = parseArgs([
      "--json",
      "--server",
      "https://example.test",
      "codex",
      "--org",
      "acme",
    ]);
    expect(parsed.globals.json).toBe(true);
    expect(parsed.globals.server).toBe("https://example.test");
    expect(parsed.command).toEqual(["codex"]);
    expect(parsed.options.org).toBe("acme");
  });

  it("parses two-word commands", () => {
    const parsed = parseArgs(["room", "status", "quiet-sunrise"]);
    expect(parsed.command).toEqual(["room", "status"]);
    expect(parsed.positionals).toEqual(["quiet-sunrise"]);
  });
});
