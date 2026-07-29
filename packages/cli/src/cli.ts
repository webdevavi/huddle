import { loadConfig } from "./config/load.js";
import { ExitCode } from "./exit-codes.js";
import { createDxError, renderDxError, catalogEntry, resetDiagnosticIds } from "./errors/index.js";
import { parseArgs } from "./parse-args.js";
import { createHttpControlPlane } from "./ports/http-control-plane.js";
import { createLiveRunner } from "./ports/live-runner.js";
import { createStubControlPlane, createStubRunner } from "./ports/stubs.js";
import type { ControlPlanePort, RunnerPort } from "./ports/types.js";
import { CLI_VERSION, HUDDLE_DEFAULT_SERVER } from "./version.js";
import { runAuthCommand } from "./commands/auth.js";
import { runCodexCommand } from "./commands/codex.js";
import { runConfigCommand } from "./commands/config.js";
import { runDiagnosticsCommand } from "./commands/diagnostics.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runRoomCommand } from "./commands/room.js";
import { HELP_TEXT, type CommandContext, type CommandResult, type IoStreams } from "./commands/types.js";

function shouldUseLivePorts(server: string): boolean {
  return process.env.HUDDLE_LIVE === "1" || server !== HUDDLE_DEFAULT_SERVER;
}

export type RunCliOptions = {
  argv?: string[];
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  controlPlane?: ControlPlanePort;
  runner?: RunnerPort;
  now?: () => number;
  /** Reset diagnostic id counter for deterministic tests */
  resetDiagnostics?: boolean;
};

export async function runCli(options: RunCliOptions = {}): Promise<CommandResult> {
  if (options.resetDiagnostics) {
    resetDiagnosticIds();
  }

  const argv = options.argv ?? process.argv.slice(2);
  const io: IoStreams = {
    stdout: options.stdout ?? ((line) => process.stdout.write(`${line}\n`)),
    stderr: options.stderr ?? ((line) => process.stderr.write(`${line}\n`)),
  };

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dx = createDxError("HUDDLE-USAGE-001", {
      details: { hint: message },
    });
    io.stderr(
      renderDxError(dx, { json: argv.includes("--json"), verbose: false, color: true }),
    );
    return { exitCode: catalogEntry(dx.code).exitCode };
  }

  const config = loadConfig(parsed.globals);

  if (parsed.globals.version) {
    const payload = { ok: true, version: CLI_VERSION };
    if (config.json) {
      io.stdout(JSON.stringify(payload, null, 2));
    } else {
      io.stdout(`huddle ${CLI_VERSION}`);
    }
    return { exitCode: ExitCode.SUCCESS, data: payload };
  }

  if (parsed.globals.help || parsed.command.length === 0) {
    if (config.json) {
      io.stdout(JSON.stringify({ ok: true, help: HELP_TEXT }, null, 2));
    } else {
      io.stdout(HELP_TEXT.trimEnd());
    }
    return { exitCode: ExitCode.SUCCESS };
  }

  const live = shouldUseLivePorts(config.server);
  const ctx: CommandContext = {
    config,
    args: parsed.command,
    options: parsed.options,
    positionals: parsed.positionals,
    io,
    controlPlane:
      options.controlPlane ?? (live ? createHttpControlPlane() : createStubControlPlane()),
    runner: options.runner ?? (live ? createLiveRunner() : createStubRunner()),
    now: options.now ?? (() => Date.now()),
  };

  const primary = parsed.command[0];

  try {
    switch (primary) {
      case "codex":
        return await runCodexCommand(ctx);
      case "room":
        return await runRoomCommand(ctx);
      case "auth":
        return await runAuthCommand(ctx);
      case "config":
        return await runConfigCommand(ctx);
      case "doctor":
        return await runDoctorCommand(ctx);
      case "diagnostics":
        return await runDiagnosticsCommand(ctx);
      default: {
        const dx = createDxError("HUDDLE-USAGE-001", {
          details: { hint: `Unknown command: ${primary}` },
        });
        io.stderr(
          renderDxError(dx, {
            json: config.json,
            verbose: config.verbose,
            color: config.color,
          }),
        );
        return { exitCode: catalogEntry(dx.code).exitCode };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dx = createDxError("HUDDLE-INTERNAL-001", {
      message,
    });
    io.stderr(
      renderDxError(dx, {
        json: config.json,
        verbose: config.verbose,
        color: config.color,
      }),
    );
    return { exitCode: catalogEntry(dx.code).exitCode };
  }
}

export function installSignalHandlers(): void {
  const onSigInt = (): void => {
    process.stderr.write(
      [
        "",
        "Interrupted (SIGINT).",
        "Room: not created or left as-is (stub).",
        "Codex process: not started or left running if live mode was used.",
        "Journal / worktree: preserved under .huddle/ when present.",
        "Resume: huddle room resume <room>",
        "Clean:  huddle room clean <room>",
        "",
      ].join("\n"),
    );
    process.exit(130);
  };
  process.on("SIGINT", onSigInt);
}
