import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORTED_CODEX_APP_SERVER } from "./schema/pin.js";
import { parseJsonlLine, type JsonRpcMessage } from "./transport/jsonl.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the fixtures directory for a pinned Codex version.
 * Works from both src/ and dist/ (fixtures live at package root).
 */
export function fixturesRoot(version = SUPPORTED_CODEX_APP_SERVER.pinned): string {
  return join(HERE, "..", "fixtures", version);
}

export type FixtureManifest = {
  version: string;
  schemaFingerprint: string;
  files: string[];
};

export function loadFixtureManifest(
  version = SUPPORTED_CODEX_APP_SERVER.pinned,
): FixtureManifest {
  const raw = readFileSync(join(fixturesRoot(version), "manifest.json"), "utf8");
  return JSON.parse(raw) as FixtureManifest;
}

export function loadFixtureMessages(
  name: string,
  version = SUPPORTED_CODEX_APP_SERVER.pinned,
): JsonRpcMessage[] {
  const raw = readFileSync(join(fixturesRoot(version), name), "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJsonlLine(line));
}
