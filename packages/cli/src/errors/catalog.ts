import { ExitCode } from "../exit-codes.js";
import type { DxCatalogEntry, DxErrorCode } from "./types.js";

export const DX_CATALOG: Record<DxErrorCode, DxCatalogEntry> = {
  "HUDDLE-CODEX-001": {
    code: "HUDDLE-CODEX-001",
    problem: "This Codex version cannot start a Huddle room.",
    likelyCause: "Codex is missing or outside the supported range.",
    fix: [
      "Install a supported Codex version, then run:",
      "  huddle doctor codex",
    ],
    docsPath: "errors/HUDDLE-CODEX-001",
    retryable: false,
    exitCode: ExitCode.PROVIDER,
    safeFields: ["found", "supported", "path"],
  },
  "HUDDLE-AUTH-003": {
    code: "HUDDLE-AUTH-003",
    problem: "GitHub sign-in expired before it completed.",
    likelyCause: "Device authorization timed out or was cancelled.",
    fix: [
      "Run `huddle auth login` and enter the new device code.",
      "Headless terminal? Use `huddle auth login --no-open`.",
    ],
    docsPath: "errors/HUDDLE-AUTH-003",
    retryable: true,
    exitCode: ExitCode.AUTHENTICATION,
    safeFields: [],
  },
  "HUDDLE-STORAGE-002": {
    code: "HUDDLE-STORAGE-002",
    problem: "Huddle cannot safely record remote actions.",
    likelyCause: "The local journal could not be written.",
    fix: ["huddle doctor storage", "huddle room list --storage"],
    docsPath: "errors/HUDDLE-STORAGE-002",
    retryable: true,
    exitCode: ExitCode.STORAGE,
    safeFields: ["path"],
  },
  "HUDDLE-NETWORK-001": {
    code: "HUDDLE-NETWORK-001",
    problem: "Control plane is unreachable.",
    likelyCause: "Network, DNS, TLS, or --server URL misconfiguration.",
    fix: ["huddle doctor network", "Check --server / HUDDLE_SERVER"],
    docsPath: "errors/HUDDLE-NETWORK-001",
    retryable: true,
    exitCode: ExitCode.NETWORK,
    safeFields: ["server"],
  },
  "HUDDLE-COMPAT-001": {
    code: "HUDDLE-COMPAT-001",
    problem: "Runner and control plane versions are incompatible.",
    likelyCause: "Mixed-version deployment outside the supported window.",
    fix: ["huddle doctor compatibility", "Upgrade CLI or self-hosted control plane"],
    docsPath: "errors/HUDDLE-COMPAT-001",
    retryable: false,
    exitCode: ExitCode.COMPATIBILITY,
    safeFields: ["cli", "server", "minimum", "maximum"],
  },
  "HUDDLE-USAGE-001": {
    code: "HUDDLE-USAGE-001",
    problem: "Invalid command or arguments.",
    likelyCause: "Unknown subcommand, flag, or missing required value.",
    fix: ["huddle --help"],
    docsPath: "errors/HUDDLE-USAGE-001",
    retryable: false,
    exitCode: ExitCode.USAGE,
    safeFields: ["hint"],
  },
  "HUDDLE-INTERNAL-001": {
    code: "HUDDLE-INTERNAL-001",
    problem: "An unexpected internal error occurred.",
    likelyCause: "Unhandled exception in the CLI.",
    fix: ["Retry with --verbose", "File an issue with the diagnostic id"],
    docsPath: "errors/HUDDLE-INTERNAL-001",
    retryable: true,
    exitCode: ExitCode.INTERNAL,
    safeFields: [],
  },
};

export function catalogEntry(code: DxErrorCode): DxCatalogEntry {
  return DX_CATALOG[code];
}
