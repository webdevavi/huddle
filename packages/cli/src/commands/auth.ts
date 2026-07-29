import { ExitCode } from "../exit-codes.js";
import { createDxError, renderDxError, catalogEntry } from "../errors/index.js";
import { clearSession, identityHeader, readSession, writeSession } from "../auth/session.js";
import { HUDDLE_DEFAULT_SERVER } from "../version.js";
import type { CommandContext, CommandResult } from "./types.js";

function useLiveAuth(ctx: CommandContext): boolean {
  return process.env.HUDDLE_LIVE === "1" || ctx.config.server !== HUDDLE_DEFAULT_SERVER;
}

function baseUrl(serverUrl: string): string {
  return serverUrl.replace(/\/$/, "");
}

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

  if (!useLiveAuth(ctx)) {
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

  if (sub === "logout") {
    await clearSession();
    const message = "Signed out. Cleared ~/.huddle/session.json.";
    const data = { ok: true, version: 1, command: "auth logout", message };
    if (ctx.config.json) ctx.io.stdout(JSON.stringify(data, null, 2));
    else ctx.io.stdout(message);
    return { exitCode: ExitCode.SUCCESS, data };
  }

  if (sub === "status") {
    const session = await readSession();
    const message = session
      ? `Auth status: signed in as ${session.displayName} (${session.userId}).`
      : "Auth status: not signed in.";
    const data = {
      ok: true,
      version: 1,
      command: "auth status",
      message,
      session: session
        ? {
            userId: session.userId,
            displayName: session.displayName,
            expiresAt: session.expiresAt,
          }
        : null,
    };
    if (ctx.config.json) ctx.io.stdout(JSON.stringify(data, null, 2));
    else ctx.io.stdout(message);
    return { exitCode: ExitCode.SUCCESS, data };
  }

  // login
  const server = baseUrl(ctx.config.server);
  let mode: "fake" | "github" = "fake";
  try {
    const modeRes = await fetch(`${server}/v1/auth/mode`);
    if (modeRes.ok) {
      const body = (await modeRes.json()) as { mode?: string };
      if (body.mode === "github") mode = "github";
    }
  } catch {
    // Assume fake when mode endpoint is unreachable during local bring-up.
  }

  if (mode === "github") {
    const startUrl = `${server}/v1/auth/github/start`;
    const message = ctx.config.openBrowser
      ? `GitHub auth: open ${startUrl} to continue (browser open not automated in CLI yet).`
      : `GitHub auth (--no-open): start at ${startUrl}`;
    const data = { ok: true, version: 1, command: "auth login", mode, startUrl, message };
    if (ctx.config.json) ctx.io.stdout(JSON.stringify(data, null, 2));
    else ctx.io.stdout(message);
    return { exitCode: ExitCode.SUCCESS, data };
  }

  const identity = identityHeader();
  const res = await fetch(`${server}/v1/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-huddle-user": identity,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const dx = createDxError("HUDDLE-INTERNAL-001", {
      message: `Auth login failed (${res.status}): ${text}`,
    });
    ctx.io.stderr(
      renderDxError(dx, {
        json: ctx.config.json,
        verbose: ctx.config.verbose,
        color: ctx.config.color,
      }),
    );
    return { exitCode: catalogEntry(dx.code).exitCode };
  }

  const body = (await res.json()) as {
    session: {
      sessionId: string;
      userId: string;
      displayName: string;
      expiresAt: string;
    };
  };
  await writeSession({
    sessionId: body.session.sessionId,
    userId: body.session.userId,
    displayName: body.session.displayName,
    expiresAt: body.session.expiresAt,
    serverUrl: server,
  });

  const message = `Signed in as ${body.session.displayName} (${body.session.userId}) via fake auth.`;
  const data = {
    ok: true,
    version: 1,
    command: "auth login",
    mode: "fake" as const,
    message,
    session: {
      userId: body.session.userId,
      displayName: body.session.displayName,
      expiresAt: body.session.expiresAt,
    },
  };
  if (ctx.config.json) ctx.io.stdout(JSON.stringify(data, null, 2));
  else ctx.io.stdout(message);
  return { exitCode: ExitCode.SUCCESS, data };
}
