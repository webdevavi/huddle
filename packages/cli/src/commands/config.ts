import { ExitCode } from "../exit-codes.js";
import { listConfigEntries } from "../config/load.js";
import { createDxError, renderDxError, catalogEntry } from "../errors/index.js";
import type { CommandContext, CommandResult } from "./types.js";

export async function runConfigCommand(ctx: CommandContext): Promise<CommandResult> {
  const sub = ctx.args[1];
  if (!sub || !["get", "set", "list"].includes(sub)) {
    const error = createDxError("HUDDLE-USAGE-001", {
      details: { hint: "huddle config get|set|list" },
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

  const entries = listConfigEntries(ctx.config);

  if (sub === "list") {
    const data = { ok: true, version: 1, config: entries };
    if (ctx.config.json) {
      ctx.io.stdout(JSON.stringify(data, null, 2));
    } else {
      for (const entry of entries) {
        ctx.io.stdout(`${entry.key}=${entry.value} (${entry.source})`);
      }
    }
    return { exitCode: ExitCode.SUCCESS, data };
  }

  if (sub === "get") {
    const key = ctx.positionals[0];
    if (!key) {
      const error = createDxError("HUDDLE-USAGE-001", {
        details: { hint: "huddle config get <key>" },
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
    const found = entries.find((e) => e.key === key);
    const value = found?.value ?? "";
    const data = { ok: true, version: 1, key, value, found: Boolean(found) };
    if (ctx.config.json) {
      ctx.io.stdout(JSON.stringify(data, null, 2));
    } else {
      ctx.io.stdout(value);
    }
    return { exitCode: ExitCode.SUCCESS, data };
  }

  // set
  const key = ctx.positionals[0];
  const value = ctx.positionals[1];
  if (!key || value === undefined) {
    const error = createDxError("HUDDLE-USAGE-001", {
      details: { hint: "huddle config set <key> <value>" },
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

  const message = `Config set stub: would persist ${key}=${value} to user config (not repository).`;
  const data = { ok: true, version: 1, key, value, message };
  if (ctx.config.json) {
    ctx.io.stdout(JSON.stringify(data, null, 2));
  } else {
    ctx.io.stdout(message);
  }
  return { exitCode: ExitCode.SUCCESS, data };
}
