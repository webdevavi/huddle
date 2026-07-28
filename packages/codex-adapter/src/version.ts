import { createHuddleError, type HuddleError } from "@huddle/protocol";
import { SUPPORTED_CODEX_APP_SERVER } from "./schema/pin.js";

export type CodexVersionDetection =
  | { ok: true; version: string; schemaFingerprint: string }
  | { ok: false; error: HuddleError; detectedVersion?: string };

export function parseCodexVersion(raw: string): [number, number, number] | null {
  const cleaned = raw.trim().replace(/^v/i, "").split("-")[0]?.split("+")[0];
  if (!cleaned) return null;
  const parts = cleaned.split(".");
  if (parts.length < 3) return null;
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) return null;
  return [major, minor, patch];
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

export function isCodexVersionSupported(version: string): boolean {
  const parsed = parseCodexVersion(version);
  const min = parseCodexVersion(SUPPORTED_CODEX_APP_SERVER.min);
  const max = parseCodexVersion(SUPPORTED_CODEX_APP_SERVER.max);
  if (!parsed || !min || !max) return false;
  return compareVersions(parsed, min) >= 0 && compareVersions(parsed, max) <= 0;
}

export function repairGuidanceFor(version: string | undefined): string {
  const detected = version ? `Detected ${version}. ` : "";
  return (
    `${detected}Huddle supports Codex App Server ${SUPPORTED_CODEX_APP_SERVER.min}–${SUPPORTED_CODEX_APP_SERVER.max} ` +
    `(pinned fixture ${SUPPORTED_CODEX_APP_SERVER.pinned}, fingerprint ${SUPPORTED_CODEX_APP_SERVER.schemaFingerprint}). ` +
    `Install a compatible Codex binary (for example: npm i -g @openai/codex@${SUPPORTED_CODEX_APP_SERVER.pinned}) and retry.`
  );
}

export function detectCodexCompatibility(
  version: string,
  diagnosticId: string,
): CodexVersionDetection {
  if (!isCodexVersionSupported(version)) {
    return {
      ok: false,
      detectedVersion: version,
      error: createHuddleError({
        code: "PROVIDER_INCOMPATIBLE",
        message: repairGuidanceFor(version),
        retryable: false,
        diagnosticId,
      }),
    };
  }
  return {
    ok: true,
    version,
    schemaFingerprint: SUPPORTED_CODEX_APP_SERVER.schemaFingerprint,
  };
}
