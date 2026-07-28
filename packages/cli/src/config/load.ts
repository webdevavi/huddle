import { HUDDLE_DEFAULT_SERVER } from "../version.js";
import { DEFAULT_CONFIG, type GlobalFlags, type HuddleConfig } from "./types.js";

function envBool(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

/**
 * Config precedence: CLI flags > HUDDLE_* env > project-safe config >
 * user config > defaults. Credentials never enter repository config.
 * Project/user file layers are stubs until persistence lands.
 */
export function loadConfig(flags: GlobalFlags): HuddleConfig {
  const envServer = process.env.HUDDLE_SERVER;
  const envColor = envBool("HUDDLE_COLOR");
  const envOpen = envBool("HUDDLE_OPEN");
  const envJson = envBool("HUDDLE_JSON");
  const envQuiet = envBool("HUDDLE_QUIET");
  const envVerbose = envBool("HUDDLE_VERBOSE");
  const envNonInteractive = envBool("HUDDLE_NON_INTERACTIVE");

  return {
    server: flags.server ?? envServer ?? DEFAULT_CONFIG.server ?? HUDDLE_DEFAULT_SERVER,
    color: flags.noColor ? false : (envColor ?? DEFAULT_CONFIG.color),
    openBrowser: flags.noOpen ? false : (envOpen ?? DEFAULT_CONFIG.openBrowser),
    json: flags.json || (envJson ?? DEFAULT_CONFIG.json),
    quiet: flags.quiet || (envQuiet ?? DEFAULT_CONFIG.quiet),
    verbose: flags.verbose || (envVerbose ?? DEFAULT_CONFIG.verbose),
    nonInteractive:
      flags.nonInteractive || (envNonInteractive ?? DEFAULT_CONFIG.nonInteractive),
  };
}

export function listConfigEntries(config: HuddleConfig): Array<{ key: string; value: string; source: string }> {
  return [
    { key: "server", value: config.server, source: "resolved" },
    { key: "color", value: String(config.color), source: "resolved" },
    { key: "openBrowser", value: String(config.openBrowser), source: "resolved" },
    { key: "json", value: String(config.json), source: "resolved" },
    { key: "quiet", value: String(config.quiet), source: "resolved" },
    { key: "verbose", value: String(config.verbose), source: "resolved" },
    { key: "nonInteractive", value: String(config.nonInteractive), source: "resolved" },
  ];
}
