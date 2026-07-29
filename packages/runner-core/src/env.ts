/**
 * ENG-T6: sanitize inherited environment for runner/provider processes.
 */

const BLOCKED_ENV_PREFIXES = ["GIT_TRACE", "GIT_CURL", "LD_PRELOAD", "DYLD_"];

const BLOCKED_ENV_KEYS = new Set([
  "GIT_EXEC_PATH",
  "GIT_TEMPLATE_DIR",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG",
  "NODE_OPTIONS",
]);

/**
 * Produce a minimal env for Codex/runner child processes.
 * Drops credential-bearing and hook-influencing variables; keeps PATH sanitized separately.
 */
export function sanitizeRunnerEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { allowKeys?: readonly string[] } = {},
): NodeJS.ProcessEnv {
  const allow = new Set(options.allowKeys ?? ["HOME", "USER", "LANG", "LC_ALL", "TERM", "TMPDIR", "TMP", "TEMP"]);
  const out: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(env)) {
    if (value == null) continue;
    if (BLOCKED_ENV_KEYS.has(key)) continue;
    if (BLOCKED_ENV_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (key.startsWith("HUDDLE_")) {
      out[key] = value;
      continue;
    }
    if (allow.has(key) || key === "PATH" || key === "PATHEXT") {
      out[key] = value;
    }
  }

  // Explicitly neutralize git hook lookup for Huddle-managed operations.
  out.GIT_CONFIG_COUNT = "1";
  out.GIT_CONFIG_KEY_0 = "core.hooksPath";
  out.GIT_CONFIG_VALUE_0 = "/dev/null";

  return out;
}
