import { ExitCode } from "../exit-codes.js";
import { createDxError, renderDxError, catalogEntry } from "../errors/index.js";
import { SUPPORTED_CODEX_RANGE } from "../ports/detect-codex.js";
import { CLI_VERSION } from "../version.js";
import { runPreflight } from "../preflight/checks.js";
import type { CommandContext, CommandResult } from "./types.js";

const DOCTOR_TARGETS = ["codex", "auth", "network", "storage", "compatibility"] as const;
type DoctorTarget = (typeof DOCTOR_TARGETS)[number];

function isDoctorTarget(value: string): value is DoctorTarget {
  return (DOCTOR_TARGETS as readonly string[]).includes(value);
}

export async function runDoctorCommand(ctx: CommandContext): Promise<CommandResult> {
  const target = ctx.args[1];
  if (target && !isDoctorTarget(target)) {
    const error = createDxError("HUDDLE-USAGE-001", {
      details: { hint: `huddle doctor [${DOCTOR_TARGETS.join("|")}]` },
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

  const preflight = runPreflight();
  const health = await ctx.controlPlane.health(ctx.config.server);

  const sections: Array<{ id: string; ok: boolean; summary: string; details?: Record<string, string> }> = [];

  if (!target || target === "codex") {
    const check = preflight.checks.find((c) => c.id === "codex")!;
    sections.push({
      id: "codex",
      ok: !preflight.codex.found || preflight.codex.supported,
      summary: check.summary,
      ...(check.details ? { details: check.details } : {}),
    });
  }

  if (!target || target === "auth") {
    sections.push({
      id: "auth",
      ok: true,
      summary: "Auth stub: no session required for local contributor mode",
      details: { status: "unsigned" },
    });
  }

  if (!target || target === "network") {
    sections.push({
      id: "network",
      ok: health.ok,
      summary: health.ok
        ? `Control plane stub healthy at ${ctx.config.server}`
        : `Control plane unreachable at ${ctx.config.server}`,
      details: {
        server: ctx.config.server,
        ...(health.version ? { version: health.version } : {}),
      },
    });
  }

  if (!target || target === "storage") {
    const check = preflight.checks.find((c) => c.id === "storage")!;
    sections.push({
      id: "storage",
      ok: check.ok,
      summary: check.summary,
      ...(check.details ? { details: check.details } : {}),
    });
  }

  if (!target || target === "compatibility") {
    sections.push({
      id: "compatibility",
      ok: true,
      summary: "CLI/server compatibility within stub window",
      details: {
        cli: CLI_VERSION,
        server: health.version ?? "unknown",
        minimum: "0.0.0",
        maximum: "0.0.0",
        action: "none",
        codexSupported: SUPPORTED_CODEX_RANGE,
      },
    });
  }

  // Always include node/git when running full doctor
  if (!target) {
    for (const id of ["node", "git", "workspace"] as const) {
      const check = preflight.checks.find((c) => c.id === id);
      if (check) {
        sections.unshift({
          id: check.id,
          ok: check.ok,
          summary: check.summary,
          ...(check.details ? { details: check.details } : {}),
        });
      }
    }
  }

  const ok = sections.every((s) => s.ok);
  const data = {
    ok,
    version: 1,
    target: target ?? "all",
    checks: sections,
  };

  if (ctx.config.json) {
    ctx.io.stdout(JSON.stringify(data, null, 2));
  } else {
    ctx.io.stdout(`huddle doctor${target ? ` ${target}` : ""}`);
    for (const section of sections) {
      ctx.io.stdout(`${section.ok ? "ok" : "FAIL"}  ${section.id.padEnd(14)} ${section.summary}`);
    }
    ctx.io.stdout(ok ? "\nAll checked systems look ready." : "\nOne or more checks failed. See summaries above.");
  }

  return { exitCode: ok ? ExitCode.SUCCESS : ExitCode.PREREQUISITE, data };
}
