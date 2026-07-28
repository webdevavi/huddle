# Data boundary

Huddle separates **local execution** from **relayed collaboration**.

## Stays on the host

- Codex / agent process and credentials
- Repository contents and worktrees under `.huddle/worktrees/`
- Local append-only journal / recovery metadata
- Raw stack traces behind explicit debug settings

## May be relayed through the control plane

- Structured room events (status, driver lease, approvals, bounded diffs/summaries)
- Membership, invite exchange, and role metadata
- Redacted / visibility-classified output intended for collaborators

## Must not be collected by default analytics

Content-free funnel metrics never include repository names, absolute paths, prompts,
commands, diffs, or room content. Self-host telemetry defaults **off**.

## Self-host note

A single-container deployment covers the **control plane**. The runner still executes
beside the repository on a host you control. See [Self-host quickstart](../self-host/quickstart.md).
