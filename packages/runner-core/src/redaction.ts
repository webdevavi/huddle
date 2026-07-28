import type { Visibility } from "@huddle/protocol";

export type RedactionResult = {
  text: string;
  truncated: boolean;
  redacted: boolean;
  visibility: Visibility;
};

export type RedactionOptions = {
  exactSecrets?: readonly string[];
  maxLength?: number;
  visibility?: Visibility;
};

const DEFAULT_PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@[^\s]+/gi,
];

/**
 * Fail-closed redaction + visibility classification before outbound sync (§14.3 / CEO-T4).
 */
export function redactAndClassify(
  input: string,
  options: RedactionOptions = {},
): RedactionResult {
  let text = input;
  let redacted = false;

  for (const secret of options.exactSecrets ?? []) {
    if (!secret) continue;
    if (text.includes(secret)) {
      text = text.split(secret).join("[REDACTED]");
      redacted = true;
    }
  }

  for (const pattern of DEFAULT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      pattern.lastIndex = 0;
      text = text.replace(pattern, "[REDACTED]");
      redacted = true;
    }
  }

  let truncated = false;
  const maxLength = options.maxLength ?? 32_768;
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}\n…[truncated]`;
    truncated = true;
  }

  return {
    text,
    truncated,
    redacted,
    visibility: options.visibility ?? "room",
  };
}

export function classifyApprovalVisibility(category: string): Visibility {
  if (category === "git_publish" || category === "deployment" || category === "outside_workspace") {
    return "owner";
  }
  if (category === "network") return "approvers";
  return "room";
}
