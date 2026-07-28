import { describe, expect, it } from "vitest";
import {
  StubApprovalVerifier,
  StubEvidenceDigester,
  authorizeMutation,
  checkDriverLease,
  roleHasCapability,
} from "../index.js";

describe("authz contracts", () => {
  it("maps owner capabilities and denies viewer queue", () => {
    expect(roleHasCapability("owner", "room.queue")).toBe(true);
    expect(roleHasCapability("viewer", "room.queue")).toBe(false);
  });

  it("requires a valid lease for steer", () => {
    const nowIso = "2026-07-28T00:00:00.000Z";
    const denied = authorizeMutation({
      role: "owner",
      capability: "room.steer",
      memberId: "m1",
      nowIso,
    });
    expect(denied).toEqual({ ok: false, reason: "lease_required" });

    const allowed = authorizeMutation({
      role: "owner",
      capability: "room.steer",
      memberId: "m1",
      expectedLeaseVersion: 1,
      nowIso,
      lease: {
        roomId: "r1",
        memberId: "m1",
        leaseVersion: 1,
        acquiredAt: nowIso,
        expiresAt: "2026-07-28T01:00:00.000Z",
        lastActivityAt: nowIso,
      },
    });
    expect(allowed).toEqual({ ok: true });
  });

  it("detects stale leases", () => {
    const result = checkDriverLease({
      memberId: "m1",
      expectedLeaseVersion: 2,
      nowIso: "2026-07-28T00:00:00.000Z",
      lease: {
        roomId: "r1",
        memberId: "m1",
        leaseVersion: 1,
        acquiredAt: "2026-07-28T00:00:00.000Z",
        expiresAt: "2026-07-28T01:00:00.000Z",
        lastActivityAt: "2026-07-28T00:00:00.000Z",
      },
    });
    expect(result).toEqual({ ok: false, reason: "stale_version" });
  });

  it("fails closed on stub approval verification after structural checks", () => {
    const digester = new StubEvidenceDigester();
    const digest = digester.digest({
      category: "network",
      raw: { command: "curl example.com" },
    });
    const verifier = new StubApprovalVerifier();
    const result = verifier.verify(
      {
        roomIncarnation: "inc",
        runnerEpoch: 1,
        requestNonce: "nonce",
        evidenceDigest: digest,
        decision: "allow",
        expiresAt: "2026-07-28T01:00:00.000Z",
        membershipVersion: 1,
        capabilityGrant: { memberId: "m1", categories: ["network"], membershipVersion: 1 },
        signerPublicKey: "pk",
        signature: "sig",
      },
      {
        roomIncarnation: "inc",
        runnerEpoch: 1,
        expectedNonce: "nonce",
        expectedDigest: digest,
        nowIso: "2026-07-28T00:00:00.000Z",
        consumedNonces: new Set(),
      },
    );
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });
});
