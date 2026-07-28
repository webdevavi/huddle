import type { ExitCodeValue } from "../exit-codes.js";

export type DxErrorCode =
  | "HUDDLE-CODEX-001"
  | "HUDDLE-AUTH-003"
  | "HUDDLE-STORAGE-002"
  | "HUDDLE-NETWORK-001"
  | "HUDDLE-COMPAT-001"
  | "HUDDLE-USAGE-001"
  | "HUDDLE-INTERNAL-001";

export type DxCatalogEntry = {
  code: DxErrorCode;
  problem: string;
  likelyCause: string;
  fix: string[];
  docsPath: string;
  retryable: boolean;
  exitCode: ExitCodeValue;
  safeFields: string[];
};

export type DxError = {
  code: DxErrorCode;
  message: string;
  details?: Record<string, string>;
  diagnosticId: string;
};
