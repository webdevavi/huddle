import { ExitCode } from "../exit-codes.js";
import { CLI_VERSION } from "../version.js";
import { runPreflight } from "../preflight/checks.js";
import type { CommandContext, CommandResult } from "./types.js";

/**
 * Metadata-only diagnostics bundle. Never uploads; previews included fields.
 */
export async function runDiagnosticsCommand(ctx: CommandContext): Promise<CommandResult> {
  const sub = ctx.args[1] ?? "create";
  if (sub !== "create") {
    ctx.io.stderr(`Unknown diagnostics subcommand: ${sub}`);
    return { exitCode: ExitCode.USAGE };
  }

  const preflight = runPreflight();
  const bundle = {
    version: 1,
    kind: "metadata-only",
    createdAt: new Date(ctx.now()).toISOString(),
    cliVersion: CLI_VERSION,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    server: ctx.config.server,
    checks: preflight.checks.map((c) => ({
      id: c.id,
      ok: c.ok,
      summary: c.summary,
    })),
    // Explicitly excluded: repository names, paths beyond .huddle, prompts, diffs
    excluded: [
      "repository names",
      "absolute workspace paths",
      "prompts",
      "commands",
      "diffs",
      "room content",
      "credentials",
    ],
  };

  const preview = [
    "Diagnostics bundle preview (metadata only — nothing uploaded):",
    ...Object.entries(bundle).map(([key, value]) => {
      if (key === "checks" || key === "excluded") {
        return `  ${key}: ${JSON.stringify(value)}`;
      }
      return `  ${key}: ${String(value)}`;
    }),
    "",
    ctx.config.nonInteractive
      ? "Non-interactive: bundle printed only; not written to disk."
      : "Confirm write with an interactive prompt when file persistence lands (stub).",
  ].join("\n");

  if (ctx.config.json) {
    ctx.io.stdout(JSON.stringify({ ok: true, preview: bundle }, null, 2));
  } else {
    ctx.io.stdout(preview);
  }

  return { exitCode: ExitCode.SUCCESS, data: bundle };
}
