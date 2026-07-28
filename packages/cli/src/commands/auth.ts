import { ExitCode } from "../exit-codes.js";
import { createDxError, renderDxError, catalogEntry } from "../errors/index.js";
import type { CommandContext, CommandResult } from "./types.js";

export async function runAuthCommand(ctx: CommandContext): Promise<CommandResult> {
  const sub = ctx.args[1];
  if (!sub || !["login", "logout", "status"].includes(sub)) {
    const error = createDxError("HUDDLE-USAGE-001", {
      details: { hint: "huddle auth login|logout|status" },
    });
    ctx.io.stderr(
      renderDxError(error, {
        json: ctx.config.json,
        verbose: ctx.config.verbose,
        color: ctx.config.color,
      }),
    );
    return { exitCode: catalogEntry(error.code).exitCode };
  }

  const messages: Record<string, string> = {
    login: ctx.config.openBrowser
      ? "Auth login stub: device flow not started (no production credentials required in contributor mode)."
      : "Auth login stub (--no-open): print device code when control-plane auth lands.",
    logout: "Auth logout stub: cleared local session placeholder.",
    status: "Auth status: not signed in (stub).",
  };

  const message = messages[sub]!;
  const data = { ok: true, version: 1, command: `auth ${sub}`, message };
  if (ctx.config.json) {
    ctx.io.stdout(JSON.stringify(data, null, 2));
  } else {
    ctx.io.stdout(message);
  }
  return { exitCode: ExitCode.SUCCESS, data };
}
