#!/usr/bin/env node
/**
 * Codex live-path smoke: detect binary, report support band, optionally spawn app-server.
 * Does not require model credentials. Exit 0 when detection path is healthy
 * (found+supported, or intentionally absent in CI without Codex).
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter } from "node:path";

const SUPPORTED_MIN = [0, 145, 0];
const requireLive = process.env.HUDDLE_REQUIRE_CODEX === "1";

function which(command) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = `${dir}/${command}`;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }
  return undefined;
}

function parseVersion(raw) {
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function gte(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

const path = which("codex");
if (!path) {
  const report = {
    ok: !requireLive,
    found: false,
    supported: false,
    message: requireLive
      ? "Codex binary required but not found on PATH"
      : "Codex not on PATH (stub mode OK)",
    supportedRange: ">=0.145.0",
    repair: "npm i -g @openai/codex@0.146.0",
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(requireLive ? 1 : 0);
}

const versionResult = spawnSync(path, ["--version"], { encoding: "utf8", timeout: 8_000 });
const raw = `${versionResult.stdout ?? ""}${versionResult.stderr ?? ""}`;
const version = parseVersion(raw);
const supported = version ? gte(version, SUPPORTED_MIN) : false;

let appServer = null;
if (supported && process.env.HUDDLE_SPAWN_CODEX === "1") {
  const child = spawnSync(path, ["app-server", "--help"], {
    encoding: "utf8",
    timeout: 8_000,
  });
  appServer = {
    helpExit: child.status,
    recognizesAppServer:
      child.status === 0 ||
      `${child.stdout ?? ""}${child.stderr ?? ""}`.toLowerCase().includes("app-server") ||
      child.status === 0,
  };
}

const report = {
  ok: supported || !requireLive,
  found: true,
  path,
  version: version ? version.join(".") : null,
  supported,
  supportedRange: ">=0.145.0",
  appServer,
  note: "Adapter fixtures pin Codex App Server protocol 0.50.x; CLI band is independent.",
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
