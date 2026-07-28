import { ExitCode } from "../exit-codes.js";
import { createDxError, renderDxError, catalogEntry } from "../errors/index.js";
import type { CommandContext, CommandResult } from "./types.js";

export async function runRoomCommand(ctx: CommandContext): Promise<CommandResult> {
  const sub = ctx.args[1];
  if (!sub) {
    const error = createDxError("HUDDLE-USAGE-001", {
      details: { hint: "huddle room list|status|resume|archive|clean" },
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

  const room = ctx.positionals[0] ?? "<room>";
  const messages: Record<string, string> = {
    list: "No local rooms yet (control-plane stub).",
    status: `Room ${room}: stub status — invite-only; runner not connected.`,
    resume: `Resume for ${room} is not wired yet (runner-core stub).`,
    archive: `Archive for ${room} is not wired yet (control-plane stub).`,
    clean: `Clean for ${room} would remove local worktree/journal metadata (stub).`,
  };

  const message = messages[sub];
  if (!message) {
    const error = createDxError("HUDDLE-USAGE-001", {
      details: { hint: `Unknown room subcommand: ${sub}` },
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

  const data = { ok: true, version: 1, command: `room ${sub}`, room, message };
  if (ctx.config.json) {
    ctx.io.stdout(JSON.stringify(data, null, 2));
  } else {
    ctx.io.stdout(message);
  }
  return { exitCode: ExitCode.SUCCESS, data };
}
