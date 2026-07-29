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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDeviceLogin(
  server: string,
  deviceCode: string,
  intervalSec: number,
  expiresInSec: number,
  ctx: CommandContext,
): Promise<CommandResult> {
  const deadline = Date.now() + expiresInSec * 1000;
  let intervalMs = Math.max(1, intervalSec) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    let res: Response;
    try {
      res = await fetch(`${server}/v1/auth/github/device/poll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode }),
      });
    } catch (err) {
      const dx = createDxError("HUDDLE-AUTH-003", {
        message: `Auth poll failed: ${err instanceof Error ? err.message : String(err)}`,
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

    if (res.status === 410 || res.status === 403) {
      const dx = createDxError("HUDDLE-AUTH-003", {
        message: `Device authorization ${res.status === 410 ? "expired" : "denied"}.`,
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

    if (!res.ok) {
      const text = await res.text();
      const dx = createDxError("HUDDLE-AUTH-003", {
        message: `Auth poll failed (${res.status}): ${text}`,
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
      status?: string;
      interval?: number;
      slowDown?: boolean;
      session?: {
        sessionId: string;
        userId: string;
        displayName: string;
        expiresAt: string;
      };
    };

    if (typeof body.interval === "number" && body.interval > 0) {
      intervalMs = body.interval * 1000;
    }
    if (body.slowDown) {
      intervalMs += 5_000;
    }

    if (body.status === "complete" && body.session) {
      await writeSession({
        sessionId: body.session.sessionId,
        userId: body.session.userId,
        displayName: body.session.displayName,
        expiresAt: body.session.expiresAt,
        serverUrl: server,
      });
      const message = `Signed in as ${body.session.displayName} (${body.session.userId}) via GitHub.`;
      const data = {
        ok: true,
        version: 1,
        command: "auth login",
        mode: "github" as const,
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
  }

  const dx = createDxError("HUDDLE-AUTH-003", {
    message: "Device authorization timed out before completion.",
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
    const deviceRes = await fetch(`${server}/v1/auth/github/device`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!deviceRes.ok) {
      const text = await deviceRes.text();
      const dx = createDxError("HUDDLE-AUTH-003", {
        message: `GitHub device start failed (${deviceRes.status}): ${text}`,
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

    const device = (await deviceRes.json()) as {
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      verificationUriComplete?: string;
      expiresIn: number;
      interval: number;
    };

    const openTarget = device.verificationUriComplete ?? device.verificationUri;
    const lines = [
      `GitHub device login`,
      `  Code: ${device.userCode}`,
      `  Open: ${openTarget}`,
      ctx.config.openBrowser
        ? "Complete authorization in the browser, then return here."
        : "Open the URL above (--no-open), enter the code, then wait.",
    ];
    if (!ctx.config.json) {
      for (const line of lines) ctx.io.stdout(line);
    }

    if (ctx.config.openBrowser && process.env.HUDDLE_OPEN_BROWSER !== "0") {
      try {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        const opener =
          process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
        const args =
          process.platform === "win32" ? ["/c", "start", "", openTarget] : [openTarget];
        await execFileAsync(opener, args, { timeout: 5_000 }).catch(() => undefined);
      } catch {
        // Browser open is best-effort.
      }
    }

    return pollDeviceLogin(server, device.deviceCode, device.interval, device.expiresIn, ctx);
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
