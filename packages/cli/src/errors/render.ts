import { catalogEntry } from "./catalog.js";
import type { DxError, DxErrorCode } from "./types.js";

let diagnosticCounter = 0;

export function nextDiagnosticId(): string {
  diagnosticCounter += 1;
  const suffix = diagnosticCounter.toString(36).toUpperCase().padStart(4, "0");
  return `hd_${suffix}`;
}

/** Test helper to keep snapshot diagnostics stable. */
export function resetDiagnosticIds(): void {
  diagnosticCounter = 0;
}

export function createDxError(
  code: DxErrorCode,
  overrides: { message?: string; details?: Record<string, string>; diagnosticId?: string } = {},
): DxError {
  const entry = catalogEntry(code);
  const error: DxError = {
    code,
    message: overrides.message ?? entry.problem,
    diagnosticId: overrides.diagnosticId ?? nextDiagnosticId(),
  };
  if (overrides.details) {
    error.details = overrides.details;
  }
  return error;
}

export type RenderOptions = {
  json: boolean;
  verbose: boolean;
  color: boolean;
};

export function renderDxError(error: DxError, options: RenderOptions): string {
  const entry = catalogEntry(error.code);
  if (options.json) {
    return JSON.stringify(
      {
        ok: false,
        version: 1,
        error: {
          code: error.code,
          message: error.message,
          problem: entry.problem,
          likelyCause: entry.likelyCause,
          fix: entry.fix,
          retryable: entry.retryable,
          exitCode: entry.exitCode,
          diagnosticId: error.diagnosticId,
          documentation: `https://huddle.dev/${entry.docsPath}`,
          details: error.details ?? {},
        },
      },
      null,
      2,
    );
  }

  const lines: string[] = [
    `${error.code}  ${error.message}`,
    "",
  ];

  if (error.details) {
    for (const [key, value] of Object.entries(error.details)) {
      if (entry.safeFields.includes(key) || options.verbose) {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        lines.push(`${label}:`.padEnd(11) + value);
      }
    }
    if (Object.keys(error.details).length > 0) {
      lines.push("");
    }
  }

  lines.push("Nothing was started and no room was created.", "", "Fix:");
  for (const step of entry.fix) {
    lines.push(`  ${step}`);
  }
  lines.push(
    "",
    `Details: https://huddle.dev/${entry.docsPath}`,
    `Diagnostic: ${error.diagnosticId}`,
  );
  return lines.join("\n");
}
