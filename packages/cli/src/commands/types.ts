import type { HuddleConfig } from "../config/types.js";
import type { ControlPlanePort, RunnerPort } from "../ports/types.js";

export type IoStreams = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

export type CommandContext = {
  config: HuddleConfig;
  args: string[];
  options: Record<string, string | boolean>;
  positionals: string[];
  io: IoStreams;
  controlPlane: ControlPlanePort;
  runner: RunnerPort;
  now: () => number;
};

export type CommandResult = {
  exitCode: number;
  /** Machine-readable payload for --json */
  data?: unknown;
};

export const HELP_TEXT = `Huddle — multiplayer control for local coding agents

Usage:
  huddle codex [options]
  huddle room list|status|resume|archive|clean [room]
  huddle auth login|logout|status
  huddle config get|set|list [key] [value]
  huddle doctor [codex|auth|network|storage|compatibility]
  huddle diagnostics create

Global options:
  --help --version --json --no-color --quiet --verbose
  --no-open --non-interactive --server <url>

Golden path:
  npx huddle codex

First use defaults to invite-only. Use --org <slug> to restrict by organization.
The share URL is always printed; browser/clipboard success is never required.
`;
