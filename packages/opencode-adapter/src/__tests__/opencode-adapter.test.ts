import { describe, expect, it } from "vitest";
import { OpenCodeAdapter } from "../index.js";

describe("OpenCodeAdapter skeleton", () => {
  it("advertises opencode capabilities as skeleton", () => {
    const adapter = new OpenCodeAdapter({ baseUrl: "http://127.0.0.1:4096" });
    const caps = adapter.capabilities();
    expect(caps.provider).toBe("opencode");
    expect(caps.status).toBe("skeleton");
    expect(caps.baseUrl).toBe("http://127.0.0.1:4096");
  });

  it("rejects session start until Phase 3", async () => {
    const adapter = new OpenCodeAdapter();
    await expect(adapter.startSession({ workspace: "." })).rejects.toThrow(/not implemented/);
  });
});
