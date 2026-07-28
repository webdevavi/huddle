import { accessSync, constants, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { detectCodex, SUPPORTED_CODEX_RANGE } from "../ports/detect-codex.js";
import type { CodexDetection } from "../ports/types.js";

export type PreflightCheck = {
  id: "node" | "git" | "codex" | "workspace" | "storage";
  ok: boolean;
  summary: string;
  details?: Record<string, string>;
};

export type PreflightResult = {
  ok: boolean;
  checks: PreflightCheck[];
  codex: CodexDetection;
};

function checkNode(): PreflightCheck {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  const ok = major >= 22;
  return {
    id: "node",
    ok,
    summary: ok ? `Node ${process.versions.node}` : `Node ${process.versions.node} (need >= 22)`,
    details: { version: process.versions.node, required: ">=22" },
  };
}

function checkGit(): PreflightCheck {
  const result = spawnSync("git", ["--version"], { encoding: "utf8", timeout: 5_000 });
  if (result.error || result.status !== 0) {
    return {
      id: "git",
      ok: false,
      summary: "Git not found on PATH",
    };
  }
  const version = (result.stdout ?? "").trim();
  const repo = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    timeout: 5_000,
  });
  const inRepo = repo.status === 0 && (repo.stdout ?? "").trim() === "true";
  return {
    id: "git",
    ok: true,
    summary: inRepo ? `${version} (inside work tree)` : `${version} (not inside a Git work tree)`,
    details: { version, inRepo: String(inRepo) },
  };
}

function checkCodex(codex: CodexDetection): PreflightCheck {
  if (!codex.found) {
    return {
      id: "codex",
      ok: true, // optional for stub golden path
      summary: `Codex not found (stub mode); supported ${SUPPORTED_CODEX_RANGE}`,
    };
  }
  if (!codex.supported) {
    return {
      id: "codex",
      ok: false,
      summary: `Codex ${codex.version ?? "unknown"} unsupported (need ${SUPPORTED_CODEX_RANGE})`,
      details: {
        found: codex.version ?? "unknown",
        supported: SUPPORTED_CODEX_RANGE,
        ...(codex.path ? { path: codex.path } : {}),
      },
    };
  }
  return {
    id: "codex",
    ok: true,
    summary: `Codex ${codex.version} at ${codex.path}`,
    details: {
      found: codex.version ?? "",
      supported: SUPPORTED_CODEX_RANGE,
      ...(codex.path ? { path: codex.path } : {}),
    },
  };
}

function checkWorkspace(): PreflightCheck {
  try {
    accessSync(process.cwd(), constants.R_OK | constants.W_OK);
    return { id: "workspace", ok: true, summary: `Writable workspace ${process.cwd()}` };
  } catch {
    return { id: "workspace", ok: false, summary: `Workspace not writable: ${process.cwd()}` };
  }
}

function checkStorage(): PreflightCheck {
  const path = ".huddle";
  try {
    mkdirSync(path, { recursive: true });
    accessSync(path, constants.R_OK | constants.W_OK);
    return {
      id: "storage",
      ok: true,
      summary: `Local storage ready at ${path}`,
      details: { path },
    };
  } catch {
    return {
      id: "storage",
      ok: false,
      summary: `Cannot write local journal under ${path}`,
      details: { path },
    };
  }
}

export function runPreflight(options: { requireSupportedCodex?: boolean } = {}): PreflightResult {
  const codex = detectCodex();
  const checks: PreflightCheck[] = [
    checkNode(),
    checkGit(),
    checkCodex(codex),
    checkWorkspace(),
    checkStorage(),
  ];

  if (options.requireSupportedCodex && (!codex.found || !codex.supported)) {
    const codexCheck = checks.find((c) => c.id === "codex");
    if (codexCheck) {
      codexCheck.ok = false;
      if (!codex.found) {
        codexCheck.summary = `Codex not found; supported ${SUPPORTED_CODEX_RANGE}`;
      }
    }
  }

  return {
    ok: checks.every((c) => c.ok),
    checks,
    codex,
  };
}
