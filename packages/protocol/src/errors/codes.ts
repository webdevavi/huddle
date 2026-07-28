/**
 * Stable machine-readable error codes (§48).
 * Codes are additive; do not rename existing values.
 */
export const HUDDLE_ERROR_CODES = [
  "PROTOCOL_INCOMPATIBLE",
  "PROTOCOL_OBSERVATION_ONLY",
  "PROTOCOL_UNKNOWN_EVENT",
  "PROTOCOL_INVALID_ENVELOPE",
  "PROTOCOL_INVALID_PAYLOAD",
  "STATE_INVALID_TRANSITION",
  "STATE_TERMINAL",
  "AUTHZ_PERMISSION_DENIED",
  "AUTHZ_LEASE_STALE",
  "AUTHZ_APPROVAL_STALE",
  "AUTHZ_APPROVAL_UNSUPPORTED",
  "AUTHZ_CAPABILITY_MISSING",
  "RUNNER_EPOCH_STALE",
  "PROVIDER_INCOMPATIBLE",
  "STORAGE_UNAVAILABLE",
  "INTERNAL",
] as const;

export type HuddleErrorCode = (typeof HUDDLE_ERROR_CODES)[number];

export type HuddleError = {
  code: HuddleErrorCode;
  /** Safe user message: problem + likely cause + next action */
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  /** Content-free diagnostic ID */
  diagnosticId: string;
  documentationSlug: string;
};

export type CreateHuddleErrorInput = {
  code: HuddleErrorCode;
  message: string;
  retryable?: boolean;
  retryAfterMs?: number;
  diagnosticId: string;
  documentationSlug?: string;
};

export function createHuddleError(input: CreateHuddleErrorInput): HuddleError {
  const error: HuddleError = {
    code: input.code,
    message: input.message,
    retryable: input.retryable ?? false,
    diagnosticId: input.diagnosticId,
    documentationSlug: input.documentationSlug ?? docsSlugFor(input.code),
  };
  if (input.retryAfterMs !== undefined) {
    error.retryAfterMs = input.retryAfterMs;
  }
  return error;
}

export function docsSlugFor(code: HuddleErrorCode): string {
  return `errors/${code.toLowerCase().replaceAll("_", "-")}`;
}
