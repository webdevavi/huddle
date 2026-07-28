import { ExitCode } from "../exit-codes.js";
import { catalogEntry, createDxError, renderDxError } from "../errors/index.js";
import { runPreflight } from "../preflight/checks.js";
import type { CommandContext, CommandResult } from "./types.js";

function progress(ctx: CommandContext, startedAt: number, message: string): void {
  if (ctx.config.quiet || ctx.config.json) return;
  const elapsed = ((ctx.now() - startedAt) / 1000).toFixed(1);
  ctx.io.stderr(`[${elapsed}s] ${message}`);
}

/**
 * Golden path: preflight → invite-only (or --org) → stub ready room → print URL.
 * Live Codex is optional behind detection; stub runner/control-plane always work.
 */
export async function runCodexCommand(ctx: CommandContext): Promise<CommandResult> {
  const startedAt = ctx.now();
  const orgSlug = typeof ctx.options.org === "string" ? ctx.options.org : undefined;
  const name = typeof ctx.options.name === "string" ? ctx.options.name : undefined;
  const noWorktree = ctx.options["no-worktree"] === true;

  if (noWorktree && !ctx.config.nonInteractive) {
    ctx.io.stderr(
      "Warning: --no-worktree allows the agent to modify the current working tree.",
    );
  }

  progress(ctx, startedAt, "Checking Git, Codex, Node, workspace, and local storage…");
  const preflight = runPreflight();

  const storage = preflight.checks.find((c) => c.id === "storage");
  if (storage && !storage.ok) {
    const error = createDxError("HUDDLE-STORAGE-002", {
      details: storage.details ?? { path: ".huddle" },
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

  const node = preflight.checks.find((c) => c.id === "node");
  if (node && !node.ok) {
    const error = createDxError("HUDDLE-USAGE-001", {
      message: node.summary,
      details: { hint: "Install Node.js 22 or newer" },
    });
    ctx.io.stderr(
      renderDxError(error, {
        json: ctx.config.json,
        verbose: ctx.config.verbose,
        color: ctx.config.color,
      }),
    );
    return { exitCode: ExitCode.PREREQUISITE };
  }

  // Unsupported Codex blocks only when a binary is present but wrong version.
  if (preflight.codex.found && !preflight.codex.supported) {
    const error = createDxError("HUDDLE-CODEX-001", {
      details: {
        found: preflight.codex.version ?? "unknown",
        supported: "0.145.x",
        ...(preflight.codex.path ? { path: preflight.codex.path } : {}),
      },
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

  progress(
    ctx,
    startedAt,
    ctx.config.nonInteractive
      ? "Using stub session (non-interactive)…"
      : "Signing in to Huddle… (stub: invite-only default)",
  );

  progress(ctx, startedAt, noWorktree ? "Using current worktree…" : "Creating isolated worktree…");
  const workspace = await ctx.runner.ensureWorkspace({ noWorktree });

  const live = Boolean(preflight.codex.found && preflight.codex.supported);
  progress(
    ctx,
    startedAt,
    live
      ? `Starting Codex ${preflight.codex.version}…`
      : "Starting Codex (stub mode — live binary not required)…",
  );
  const agent = await ctx.runner.startAgent({ agent: "codex", live });

  progress(ctx, startedAt, "Connecting the local runner…");
  const createInput = {
    noWorktree,
    serverUrl: ctx.config.server,
    nonInteractive: ctx.config.nonInteractive,
    ...(name ? { name } : {}),
    ...(orgSlug ? { orgSlug } : {}),
  };
  const room = await ctx.controlPlane.createInviteOnlyRoom(createInput);
  room.workspace = workspace.workspace;
  room.agent = agent.agent;
  room.mode = agent.mode;

  progress(
    ctx,
    startedAt,
    `Room ready: ${room.shareUrl}`,
  );
  if (!ctx.config.quiet && !ctx.config.json) {
    ctx.io.stderr(
      `       Invite expires in ${room.inviteExpiresInHours}h. Revoke: huddle room status ${room.slug}`,
    );
  }

  const policyLabel =
    room.policy === "invite_only"
      ? "invite-only"
      : `organization (${room.orgSlug ?? "unknown"})`;

  const human = [
    "Huddle is ready.",
    "",
    `Repository: ${(preflight.checks.find((c) => c.id === "git")?.details?.inRepo === "true" ? "local git repo" : "not a git repo")}`,
    `Workspace:  ${room.workspace}`,
    `Agent:      ${room.agent}${room.mode === "stub" ? " (stub)" : ""}`,
    `Policy:     Workspace writes allowed; network and Git publish require approval`,
    `Access:     ${policyLabel}`,
    "",
    `Share: ${room.shareUrl}`,
  ].join("\n");

  const data = {
    ok: true,
    version: 1,
    room: {
      id: room.roomId,
      slug: room.slug,
      shareUrl: room.shareUrl,
      policy: room.policy,
      orgSlug: room.orgSlug ?? null,
      workspace: room.workspace,
      agent: room.agent,
      mode: room.mode,
      inviteExpiresInHours: room.inviteExpiresInHours,
    },
  };

  if (ctx.config.json) {
    ctx.io.stdout(JSON.stringify(data, null, 2));
  } else {
    ctx.io.stdout(human);
  }

  if (ctx.config.openBrowser && !ctx.config.nonInteractive && !ctx.config.json) {
    ctx.io.stderr("(browser open skipped in stub; URL printed above)");
  }

  return { exitCode: ExitCode.SUCCESS, data };
}
