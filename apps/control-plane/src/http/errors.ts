import { createHuddleError, type HuddleError, type HuddleErrorCode } from "@huddle/protocol";

export function huddleError(
  code: HuddleErrorCode,
  message: string,
  diagnosticId: string,
  retryable = false,
): HuddleError {
  return createHuddleError({ code, message, diagnosticId, retryable });
}

export function jsonError(error: HuddleError, status: number): Response {
  return Response.json({ error }, { status });
}
