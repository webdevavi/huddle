<!-- /autoplan restore point: /home/avi/.gstack/projects/huddle/main-autoplan-restore-20260728-212801.md -->

# Huddle: Multiplayer Control for Local Coding Agents

**Document type:** Product requirements and technical design

**Status:** APPROVED

**Working name:** Huddle
**Last updated:** July 28, 2026
**Approved:** July 28, 2026 — product owner selected `/autoplan` final gate option A

## 1. Executive summary

Huddle is an open-source multiplayer harness for coding agents. One person runs an agent in a local repository, executes one command, and receives a web link. Authorized teammates can open that link to watch the agent work, discuss the run, hand off control, steer the agent, inspect diffs, and resolve approval requests.

The agent, repository, credentials, and command execution remain on the host's computer. Huddle is not a remote shell and does not require users to configure Nostr identities, relays, certificates, inbound ports, Tailscale, or model API keys.

The initial product promise is:

> Start a coding agent with one command. Share one link. Work together safely.

Huddle's first release will support Codex through Codex App Server. The architecture will allow later adapters for OpenCode, Claude Code, and agents implementing the Agent Client Protocol (ACP), but the first release will not delay a coherent Codex experience to achieve shallow provider parity.

## 2. Problem

Coding-agent sessions are mostly single-player:

- The person running the agent sees its reasoning, commands, approvals, and changes.
- Teammates receive summaries in chat or review the final pull request after important decisions have already been made.
- Screen sharing permits observation but does not create structured participation, durable history, safe control transfer, or asynchronous catch-up.
- Terminal multiplexers and remote-shell products grant more machine access than collaboration around an agent actually requires.
- Decentralized approaches can provide portable identity and signed authorship, but introduce relay, key, certificate, and identity-management concepts that are unnecessary for most product teams.

The missing layer is a small collaboration protocol around an existing agent session: presence, ordered input, driver handoff, structured events, approvals, and durable history.

## 3. Product thesis

The useful boundary is not "multiplayer terminal." It is "multiplayer agent control."

Huddle should expose semantic operations:

- Watch the current run.
- Send or queue an instruction.
- Hand off the driver role.
- Interrupt an active turn.
- Inspect a plan, command, tool call, or diff.
- Approve or reject a specific requested action.
- Review and export the room history.

It should not expose:

- Arbitrary terminal keystrokes.
- A general-purpose remote shell.
- The host's filesystem outside the configured workspace.
- Provider credentials, Git credentials, or environment secrets.
- An unstructured stream that must be reconstructed by scraping terminal output.

This narrower boundary is both safer and easier to understand.

## 4. Goals

### 4.1 Product goals

1. A host can create a collaborative agent room from a repository with one command.
2. A teammate can join through a browser without installing a CLI.
3. Everyone can see the agent's progress in a structured, comprehensible timeline.
4. Exactly one person controls the agent at a time, with explicit handoff.
5. Approval authority is explicit and separate from conversational control.
6. The repository, model credentials, and execution remain on the host's machine.
7. Temporary network failures do not corrupt or duplicate the session history.
8. The complete system is open source and can be self-hosted.

### 4.2 Engineering goals

1. Integrate through provider protocols rather than terminal scraping.
2. Keep the provider connection local and inaccessible from the public network.
3. Use an append-only, ordered event model with idempotent writes.
4. Make the local runner useful even if the hosted control plane temporarily disconnects.
5. Preserve provider-native event data where it is useful instead of flattening every provider to an impoverished common format.

## 5. Non-goals for the first release

The first release will not be:

- A Git hosting service.
- A project-management or issue-tracking product.
- A Slack or Discord replacement.
- A general remote-development environment.
- A multi-agent orchestration framework.
- A hosted code-execution platform.
- A secrets manager.
- A deployment platform.
- A replacement for pull-request review.
- A decentralized identity or relay network.
- A way to attach reliably to arbitrary agent processes that Huddle did not start.
- A system where multiple people simultaneously inject instructions into one active turn.

## 6. Target users and jobs

### 6.1 Primary users

- Two engineers pairing with one coding agent.
- A senior engineer supervising an agent run initiated by a teammate.
- A product engineer inviting a designer or product manager to clarify behavior during implementation.
- An engineer asking a security or infrastructure owner to approve a sensitive action.
- A distributed team handing an agent session from one timezone to another.

### 6.2 Core jobs

- "Let my teammate see exactly what the agent is doing without screen sharing."
- "Let another engineer take over the conversation without restarting the session."
- "Get an explicit approval for a sensitive command while preserving the evidence."
- "Catch up on what happened while I was away."
- "Keep model and repository access local while sharing only the collaboration surface."

## 7. Core user experience

### 7.1 First-run experience

From a Git repository, the host runs:

```bash
npx huddle codex
```

On first use:

1. Huddle opens a browser for sign-in.
2. The host authenticates with GitHub.
3. The CLI receives a short-lived device credential.
4. The host chooses whether the room is invite-only or restricted to a GitHub organization.
5. Huddle creates an isolated Git worktree and starts Codex App Server locally.
6. The local runner establishes an outbound encrypted connection to the control plane.
7. Huddle prints and copies a share URL.

Example:

```text
Huddle is ready.

Repository: acme/payments
Workspace:  .huddle/worktrees/quiet-sunrise
Agent:      Codex
Policy:     Workspace writes allowed; network and Git publish require approval

Share: https://huddle.dev/r/quiet-sunrise
```

Subsequent launches reuse the local authentication and policy defaults:

```bash
npx huddle codex
```

Useful explicit options:

```bash
npx huddle codex --name "Fix checkout timeout"
npx huddle codex --org acme
npx huddle codex --no-worktree
npx huddle codex --self-hosted https://huddle.acme.internal
```

`--no-worktree` is an advanced option and requires a clean repository or an explicit confirmation because it allows the agent to modify the current working tree.

### 7.2 Joining a room

A teammate opens the share URL:

1. An authenticated authorized member enters immediately.
2. A guest invite is exchanged once for a secure browser session and cannot be reused.
3. The teammate lands on the room timeline and sees the current status, driver, active policy, repository name, branch, and latest diff.
4. If the run is active, historical events are loaded before live events begin.

The browser requires no local installation and never connects directly to Codex.

### 7.3 Room layout

The room has one primary workspace and three supporting controls:

1. **Timeline:** Human messages, agent messages, plans, tools, commands, approvals, driver changes, and run results in chronological order.
2. **Composer:** A persistent control attached to the timeline for permitted input.
3. **Inspector:** Contextual secondary detail for the selected event; a rail on wide
   screens and a sheet/route on narrow screens.
4. **People and policy:** Tertiary on-demand presence, role, connection, workspace,
   and permission detail.

The interface should emphasize what changed and what requires a decision. Raw streaming output is available on demand but is not the default reading experience.

## 8. Exact feature set

### 8.1 Version 1: required features

#### A. Room creation and lifecycle

- Start a room with `npx huddle codex`.
- Detect the Git root and repository metadata.
- Create a named room with a human-readable slug.
- Create an isolated Git worktree and room branch by default.
- Start and supervise a local Codex App Server child process.
- Generate an invite-only share URL.
- Show local and cloud connection health.
- End, archive, and locally resume a Huddle-created room.
- Mark a room unavailable when the host disconnects.
- Reconnect the local runner and browsers without creating a duplicate room.

#### B. Identity, invitations, and membership

- GitHub OAuth for persistent members.
- One-time guest invite links.
- Optional restriction to members of a configured GitHub organization.
- Room membership list and live presence.
- Remove a member from the room.
- Revoke all outstanding invite links.
- Short-lived local-runner room credentials.
- Secure browser sessions using HTTP-only cookies.

#### C. Roles and driver control

- Persistent membership roles are viewer, collaborator, and owner.
- Driver is a temporary lease, not a persistent role. Exactly one eligible member
  may hold it, and the owner begins with the lease.
- Approval grants are a third, independent facet: a member may hold named approval
  categories without being owner or driver.
- Request-driver-control action.
- Explicit accept, reject, and handoff actions.
- Configurable driver lease with automatic expiration after inactivity.
- Owner can reclaim control immediately.
- Driver changes appear in the durable timeline.
- Approval rights remain independent of the driver role.

#### D. Agent conversation

- Start a Codex thread and turn from the room.
- Stream agent messages incrementally.
- Render completed messages separately from their transient deltas.
- Show the current plan and plan updates.
- Queue the next instruction while a turn is running.
- Steer an active Codex turn using its native steering operation.
- Interrupt an active turn.
- Show whether an instruction was sent, queued, applied as steering, rejected, or cancelled.
- Preserve the author of every human instruction.
- Prevent simultaneous human instructions from racing through client-generated idempotency keys and server ordering.

#### E. Structured activity timeline

- Render command execution with command, working directory, status, duration, and bounded output.
- Render tool calls with tool name, safe arguments, status, and result summary.
- Render file changes grouped by file.
- Render the cumulative room diff and per-event diffs.
- Render run status: idle, starting, active, awaiting approval, interrupted, failed, or completed.
- Collapse noisy streaming events into readable activity cards.
- Permit expansion into bounded provider-native fields that the runner explicitly
  classified for that viewer. Unredacted full local output is never fetched through
  this control.
- Link every timeline item to its human or agent actor and timestamp.

#### F. Approvals and policy

- Surface Codex command-execution approval requests.
- Surface Codex file-change approval requests.
- Surface filesystem and network permission requests when provided by Codex.
- Display exact command, working directory, requested capability, affected files, and provider explanation.
- Allow, allow for session, decline, and cancel when supported by the provider.
- Restrict approval resolution to the owner by default.
- Allow the owner to designate additional approvers.
- Let non-approvers comment or recommend a decision without resolving it.
- Record requester, resolver, decision, timestamp, and relevant policy in the audit timeline.
- Require owner approval for Git push, pull-request creation, deployment-like commands, and access outside the workspace.
- Display the effective room policy persistently.

#### G. Diff and completion review

- Show changed files and additions/deletions.
- Provide unified per-file diffs with syntax highlighting.
- Update the diff as the turn progresses.
- Show the final diff, final agent message, command summary, and unresolved approvals at completion.
- Copy a Markdown run summary.
- Export the complete room timeline as JSON.
- Export a human-readable Markdown transcript with secrets redacted.

#### H. Reliability

- Assign a monotonic sequence number to every durable room event.
- Give every client mutation an idempotency key.
- Acknowledge locally submitted events.
- Resume from `after_sequence` following reconnect.
- Provide an HTTP catch-up endpoint in addition to live WebSocket delivery.
- Persist the local runner's event journal before sending events to the control plane.
- Retry delivery with exponential backoff and jitter.
- Continue a locally active agent turn during a temporary control-plane outage according to the room's policy.
- Clearly mark stale presence and unavailable host state.

#### I. Privacy and safety

- Keep provider, Git, and model credentials local.
- Use an outbound-only runner connection; require no inbound firewall rule.
- Communicate with Codex App Server over local stdio.
- Expose no arbitrary remote terminal input.
- Limit the agent to the selected workspace through Codex sandbox settings.
- Redact configured environment-variable values and common credential patterns from relayed output.
- Bound streamed command output by size and retain full output locally when configured.
- Hide sensitive output from viewers while permitting owner-only inspection.
- Hash invite tokens at rest.
- Validate browser origins and protect state-changing HTTP operations against CSRF.
- Log membership, role, driver, policy, approval, export, and room-lifecycle changes.

#### J. Open-source and deployment

- Publish the local runner, web client, control plane, and protocol/schema definitions under a permissive open-source license.
- Provide a hosted Huddle service for zero-setup use.
- Provide a single-container self-hosted deployment.
- Support configuration through environment variables.
- Support SQLite for a small self-hosted installation.
- Document migration to PostgreSQL for larger installations.
- Let the local CLI target either the hosted service or a self-hosted URL.

### 8.2 Version 1.1: next features

- OpenCode adapter using its headless HTTP and event-stream APIs.
- Persistent organization teams and reusable room policies.
- GitHub pull-request creation after explicit owner approval.
- Link a room to an issue or pull request.
- Room templates such as "pairing," "supervised junior," and "security approval."
- Browser notifications for approval requests and driver-control requests.
- Search within a room transcript.
- Filters for messages, commands, diffs, approvals, and membership events.
- Share a read-only archived room.
- Configurable retention and automatic room deletion.
- Policy rules based on command category, path, or network destination.
- Local-only mode for teams that provide their own access network.

### 8.3 Version 1.2 and later

- Claude Code adapter using streaming JSON and an MCP permission callback.
- ACP adapter for compatible agents.
- Provider capability negotiation in the UI.
- Multiple independent agent sessions inside one project room.
- Structured annotations attached to a file, diff hunk, command, or plan step.
- Scheduled or asynchronous handoff between timezones.
- Organization audit exports.
- SSO/SAML for enterprise deployments.
- Optional end-to-end encryption of relayed room payloads.
- Ephemeral hosted runners as a separate execution mode.
- Desktop and mobile notifications.
- IDE extensions that open the current room and selected diff.

## 9. Collaboration semantics

### 9.1 Input modes

Every human submission has an explicit mode:

- **Comment:** Visible to people but not sent to the agent.
- **Suggestion:** Proposed agent input that the driver can accept, edit, or reject.
- **Queue:** Instruction committed by the driver for the next turn.
- **Steer now:** Instruction sent by the driver into the active Codex turn.

There is no ambiguous shared text box where users cannot tell whether a message affected the agent.

### 9.2 Concurrent input

The control plane assigns a room sequence when it commits the resulting event. Only
the current driver may produce `queue` or `steer` operations. Driver mutations carry
the expected lease version; membership, policy, approval, and run mutations carry
their own aggregate version. Unrelated comments and suggestions do not contend on an
expected room sequence.

Suggestions from multiple collaborators may arrive concurrently. They remain independent timeline items until the driver acts on them.

### 9.3 Driver lease

The driver lease contains:

```text
room_id
member_id
lease_version
acquired_at
expires_at
last_activity_at
```

Changing the driver increments `lease_version`. Driver mutations include the expected lease version, preventing two clients from believing they simultaneously acquired control.

### 9.4 Approval authority

An approver may resolve only the approval categories granted to them. Example:

```text
approver: Priya
may approve:
  - workspace file changes
  - test commands
may not approve:
  - network access
  - git push
  - deployment commands
```

The local policy engine is authoritative. When the owner delegates an approval
category, the runner pins the approver device public key and the signed grant in its
local policy. Approval responses sign the room incarnation, runner epoch, provider
request nonce, evidence digest, decision, expiry, membership version, and capability
grant. The runner verifies the chain and consumes the nonce once. Key rotation or
revocation requires an owner-authorized local-policy update. A control-plane identity
assertion without this locally anchored signature can never authorize execution.

## 10. System architecture

### 10.1 Components

#### Local runner

The local runner is responsible for:

- Repository and worktree management.
- Provider-process lifecycle.
- Provider adapter translation.
- Local policy enforcement.
- Approval validation.
- Secret redaction.
- Durable local event journal.
- Outbound control-plane synchronization.
- Local room recovery.

#### Control plane

The control plane is responsible for:

- Authentication and browser sessions.
- Organizations, rooms, membership, invites, and roles.
- Driver lease coordination.
- Ordered room event storage.
- WebSocket fan-out.
- HTTP reconnect/catch-up.
- Notification dispatch.
- Retention and archive metadata.

It is not responsible for executing commands or storing provider credentials.

#### Web client

The web client is responsible for:

- Room timeline and presence.
- Human input and suggestion workflow.
- Driver requests and handoff.
- Plan, command, tool, diff, and approval rendering.
- Connection and host-health state.
- Room settings, export, and archival.

#### Provider adapter

Each provider adapter implements:

```typescript
interface AgentAdapter {
  capabilities(): AgentCapabilities;
  startSession(input: StartSessionInput): Promise<SessionRef>;
  resumeSession(ref: SessionRef): Promise<void>;
  startTurn(input: AgentInput): Promise<TurnRef>;
  steerTurn?(turn: TurnRef, input: AgentInput): Promise<void>;
  interruptTurn(turn: TurnRef): Promise<void>;
  resolveApproval(request: ApprovalRef, decision: Decision): Promise<void>;
  events(): AsyncIterable<NativeAgentEvent>;
  shutdown(): Promise<void>;
}
```

Capabilities are negotiated rather than assumed:

```typescript
type AgentCapabilities = {
  resume: boolean;
  inFlightSteering: boolean;
  interrupt: boolean;
  plans: boolean;
  structuredDiffs: boolean;
  commandApprovals: boolean;
  fileApprovals: boolean;
  permissionApprovals: boolean;
};
```

### 10.2 Recommended implementation

- **Language:** TypeScript for the CLI, runner, control plane, and web application.
- **CLI distribution:** npm package invoked with `npx`; standalone binaries can follow.
- **Local persistence:** append-only event journal plus a compact room-state index. Avoid a native database dependency in the first CLI release if it harms one-command installation.
- **Hosted persistence:** PostgreSQL.
- **Real-time transport:** outbound WebSocket between runner and control plane; WebSocket between browser and control plane.
- **Recovery transport:** authenticated HTTP endpoints using sequence cursors.
- **Web UI:** React-based application with server-rendered authentication and room shell.
- **Schemas:** versioned TypeScript schemas with runtime validation.

The initial hosted and self-hosted systems should share the same control-plane code. A self-hosted deployment may use SQLite, while hosted installations use PostgreSQL.

### 10.3 Codex adapter

The Codex adapter starts `codex app-server` as a child process and communicates over JSON lines on stdio.

Startup sequence:

1. Start the process.
2. Send `initialize`.
3. Send the initialized notification.
4. Start or resume a thread.
5. Apply the room's local sandbox and approval policies.
6. Begin translating notifications into Huddle events.

During a run:

- Idle driver input becomes `turn/start`.
- Active `steer now` input becomes `turn/steer` with the expected turn identifier.
- Interrupt becomes `turn/interrupt`.
- Agent messages, plans, commands, tool calls, and diffs become structured Huddle events.
- Server-initiated approval requests are paused locally and surfaced to authorized room approvers.
- Approval decisions are validated locally and translated back to Codex responses.

Codex App Server is designed for rich clients and provides structured threads, turns, streamed items, diffs, and approvals. It is therefore a stronger integration boundary than terminal capture. See [Codex App Server](https://learn.chatgpt.com/docs/app-server.md) and its [open-source implementation](https://github.com/openai/codex/tree/main/codex-rs/app-server).

### 10.4 Future adapters

OpenCode exposes a headless server, event stream, session operations, diffs, and permission responses, making it the likely second provider. See [OpenCode Server](https://dev.opencode.ai/docs/server/).

Claude Code supports streaming JSON modes and an external permission-prompt tool. It can support shared observation and approvals, although in-flight steering may initially degrade to interrupt-and-resume or queued follow-up. See the [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage).

ACP defines JSON-RPC session setup, structured session updates, cancellation, and permission requests. It should be supported as a generic adapter without replacing richer native integrations. See the [ACP protocol overview](https://agentclientprotocol.com/protocol/v1/overview).

## 11. Event protocol

### 11.1 Envelope

Every durable event uses this envelope:

```typescript
type RoomEvent<K extends RoomEventType> = {
  schemaVersion: number;
  eventId: string;
  roomId: string;
  roomIncarnation: string;
  runnerEpoch?: number;
  sequence: number;
  timestamp: string;
  actor: {
    type: "member" | "agent" | "runner" | "system";
    id: string;
    displayName?: string;
  };
  provider?: "codex" | "opencode" | "claude" | "acp";
  type: K;
  payload: RoomEventPayloads[K];
  causationId?: string;
  correlationId?: string;
  nativeIds?: Record<string, string>;
  visibility: "room" | "approvers" | "owner";
};
```

Provider-native identifiers are retained so the runner can correlate an approval, turn, command, or diff without leaking the native protocol into every client.
`RoomEventPayloads` is a runtime-validated discriminated map, not a compile-time-only
generic. Every consumer handles the generated union exhaustively. Unknown events are
stored and skipped by older readers; they are never coerced into a known type.

### 11.2 Core events

```text
room.created
room.policy_updated
room.host_connected
room.host_disconnected
room.archived

member.joined
member.left
member.role_updated
member.removed
driver.requested
driver.changed

input.commented
input.suggested
input.accepted
input.rejected
input.queued
input.steered
effect.accepted
effect.dispatched
effect.runner_durable
effect.provider_submitted
effect.applied
effect.rejected
effect.unknown

run.starting
run.started
run.awaiting_approval
run.interrupted
run.failed
run.completed

agent.message_delta
agent.message_completed
agent.plan_updated
agent.tool_started
agent.tool_updated
agent.tool_completed
agent.command_started
agent.command_output
agent.command_completed
agent.diff_updated

approval.requested
approval.commented
approval.resolved
```

High-volume deltas may be transient on the control plane. Completed messages, commands, tools, diffs, decisions, and lifecycle changes are always durable.

### 11.3 Delivery guarantees

- Mutations are at-least-once from clients and the runner.
- Idempotency keys make control-plane mutation acceptance once-only. They do not
  make an opaque provider effect once-only.
- Durable events are read in increasing sequence order.
- A client may receive a live event more than once and must deduplicate by `eventId`.
- Mutation status is explicit:
  `received -> authorized -> durable -> dispatched -> runner_durable ->
  provider_submitted -> applied | rejected | cancelled | expired | unknown`.
  The UI never labels `durable` as delivered or `provider_submitted` as applied.
- An `unknown` provider effect is never automatically replayed without a stable
  provider operation identifier; it requires reconciliation or reissue.
- Subscription handshake returns a committed high-water mark. The client buffers
  live authorized events above it, catches up through it using an opaque
  visibility-safe cursor and byte-bounded pages, drains the buffer, then continues.
- The room does not promise synchronized raw token deltas; it promises an ordered durable history of meaningful completed activity.

This follows lessons documented by Meet AI's work on Codex sessions and reconnect reliability: structured provider events, sequence numbers, WebSocket delivery, and REST catch-up are more robust than terminal capture or WebSocket-only recovery. See its [Codex App Server roadmap](https://github.com/SoftWare-A-G/meet-ai/blob/main/docs/plans/2026-03-08-codex-app-server-roadmap.md) and [WebSocket reliability design](https://github.com/SoftWare-A-G/meet-ai/blob/main/docs/prd-websocket-reliability.md).

## 12. Room and run state

### 12.1 Room state

```text
creating -> waiting_for_runner -> active -> reconnecting -> active
    |                 |            |             |
  failed <------------+            +-> degraded -+
                                   +-> archiving -> archived
```

- **Creating:** Runner is registering and starting the provider.
- **Waiting for runner:** Browser identity and room exist, but the local runner has
  not completed its connection and provider compatibility checks.
- **Active:** Runner is connected; the run may be idle, running, or awaiting approval.
- **Reconnecting:** Runner heartbeat is missing inside the grace window; delivery is
  uncertain and execution-affecting controls are disabled.
- **Degraded:** The room is readable but cannot safely accept execution-affecting
  input because the runner, provider, event store, or compatibility check failed.
- **Archived:** No new input is accepted; exports remain available according to retention policy.

### 12.2 Run state

```text
idle
  -> starting
  -> active
      -> awaiting_approval
          -> active
          -> failed
      -> interrupted
      -> failed
      -> completed
  -> idle
```

Only the local runner may declare provider-derived run state. The control plane may declare connectivity state but must not infer that a turn completed because a connection closed.

## 13. Worktree and Git behavior

By default, Huddle creates:

```text
branch: huddle/<room-slug>
worktree: <git-common-dir>/huddle-worktrees/<room-id>
```

The room records:

- Repository remote identity, when safely available.
- Base branch and base commit.
- Worktree path locally; browsers see only a sanitized workspace label.
- Current branch and head commit.
- Dirty state and cumulative diff.

The first release does not automatically commit, push, or open a pull request. Those actions may be requested by the agent, but they require explicit owner approval under the command policy. Automated pull-request creation becomes a first-class version 1.1 feature.

If the host exits:

- The worktree remains by default.
- `huddle resume <room>` reopens the managed room.
- `huddle archive <room>` archives the room without deleting files.
- `huddle clean <room>` shows the exact worktree and branch to be removed and asks for explicit confirmation.

## 14. Security model

### 14.1 Trust boundaries

The host trusts:

- The locally installed Huddle runner.
- The selected provider executable.
- The local repository and configured tools.

The host does not automatically trust:

- Every room participant with shell access.
- Browser clients to resolve arbitrary approval categories.
- The control plane to weaken local sandbox or approval policy.
- Agent-generated command output to be free of secrets.

### 14.2 Authorization

Every mutation is checked by:

1. Browser or runner authentication.
2. Current room membership.
3. Role capability.
4. Driver lease where relevant.
5. Approval category grant where relevant.
6. Local policy validation for execution-affecting mutations.

Room authorization is capability-based internally even if the UI presents simple roles.

### 14.3 Output handling

Before relaying output, the runner:

1. Applies provider-native sensitivity metadata when available.
2. Redacts exact configured secret values without logging them.
3. Applies patterns for common access tokens, private keys, and credential-bearing URLs.
4. Truncates large output and records that truncation occurred.
5. Assigns room, approver-only, or owner-only visibility.

Redaction reduces accidental exposure but is not presented as a perfect data-loss-prevention system.

### 14.4 Why Huddle does not expose a general-purpose remote shell

Existing multiplayer terminal systems demonstrate the danger of equating room membership with host-machine access. Isomux's security documentation explicitly describes members as effectively having shell-equivalent operational access. Huddle avoids this by accepting only a closed set of agent-control operations and preserving the provider sandbox as the final execution boundary. See the [Isomux security audit](https://github.com/nmamano/isomux/blob/main/docs/security-audit.md).

This is a capability-boundary claim, not a claim that browser participants or the
control plane see no project data. Structured prompts, selected output, diffs,
approval evidence, and metadata leave the host after redaction. The UI, onboarding,
and privacy policy must say this plainly.

## 15. Data storage and privacy

### 15.1 Stored by the control plane

- User and organization identity.
- Room metadata and membership.
- Role and driver history.
- Durable room events after redaction.
- Approval records.
- Sanitized diffs and bounded command/tool output.
- Archive and retention metadata.

### 15.2 Kept local

- Provider credentials.
- Git credentials.
- Full repository contents.
- Files outside the explicit workspace.
- Unredacted full command output.
- Provider process state and local recovery metadata.

### 15.3 Retention

Initial defaults:

- Active room events: 30 days after last activity.
- Archived room events: 30 additional days unless retained explicitly.
- One-time invite material: deleted after exchange or expiry.
- Runner credentials: short-lived and rotated on reconnect.
- Local worktrees and journals: retained until the host explicitly cleans them.

Self-hosted installations can override retention.

## 16. API surface

Representative control-plane endpoints:

```text
POST   /v1/rooms
GET    /v1/rooms/:roomId
POST   /v1/rooms/:roomId/invites
DELETE /v1/rooms/:roomId/invites
POST   /v1/rooms/:roomId/join
POST   /v1/rooms/:roomId/archive

GET    /v1/rooms/:roomId/events?cursor=<opaque>&limitBytes=<n>
POST   /v1/rooms/:roomId/inputs
POST   /v1/rooms/:roomId/driver/request
POST   /v1/rooms/:roomId/driver/handoff
POST   /v1/rooms/:roomId/approvals/:approvalId/resolve

GET    /v1/rooms/:roomId/stream
GET    /v1/runner/connect
```

WebSocket messages use the same versioned schemas as HTTP mutations and events. WebSocket URLs use short-lived tickets rather than long-lived API keys in query strings.

## 17. Observability

The system records:

- Runner connection and reconnect duration.
- Provider startup and initialization failures.
- Event ingest latency.
- Event delivery and catch-up lag.
- Sequence gaps and duplicate mutation rates.
- Turn duration and approval wait time.
- Redaction and truncation counts without recording secret content.
- Browser connection health.

An operator can diagnose room health without reading the room's source code or sensitive output.

## 18. Success criteria

### 18.1 Activation

- A new user reaches a shareable room within three minutes.
- A returning user reaches a shareable room within 20 seconds, excluding provider startup.
- No networking or certificate configuration is required for hosted use.
- At least 40% of hosts who create a room have a second authenticated participant
  join during the same session in the private beta.

### 18.2 Collaboration

- A second user can join, request control, receive control, and steer the active agent.
- Every agent-affecting human input has an identifiable author.
- Users can distinguish comments, suggestions, queued instructions, and active steering.
- A reconnecting user sees a complete ordered history without refreshing manually.
- At least 30% of two-person rooms contain one meaningful collaborator intervention:
  a suggestion accepted by the driver, a driver handoff, or a permitted approval.
- Median time from collaborator request to accepted intervention is below 60 seconds.
- At least 25% of activated hosts start another two-person room within 14 days.

### 18.3 Safety

- A viewer or collaborator cannot resolve an owner-only approval.
- No browser endpoint provides arbitrary terminal input.
- Provider and Git credentials never appear in control-plane storage.
- Revoked members cannot reconnect or submit mutations.
- A stale driver client cannot steer after control has changed.

### 18.4 Reliability

- Duplicate client submissions do not create duplicate turns.
- A dropped WebSocket followed by reconnect restores all durable events.
- The runner survives control-plane outages without corrupting its local session.
- Provider-process failure produces an explicit failed state and recoverable diagnostics.

## 19. Implementation phases

### Phase 0: local protocol spike

Build a local-only CLI that:

- Starts Codex App Server.
- Initializes a thread and turn.
- Streams messages, plans, commands, and diffs into normalized events.
- Handles steering, interruption, and command/file approvals.
- Persists an append-only local event journal.

Exit criterion: two terminal clients can observe one structured Codex session and one can control it without terminal scraping.

Ship gate:

- Generate the App Server TypeScript schema from the installed Codex binary in CI.
- Record the supported Codex version range and reject an incompatible binary with a
  repair command rather than attempting best-effort execution.
- Prove idempotent input, stale-driver rejection, and exact approval binding in tests.

### Phase 1: shared vertical slice

Add:

- Hosted control plane.
- GitHub authentication.
- Room creation and one-time invite.
- Browser timeline.
- Outbound runner WebSocket.
- Driver handoff.
- Agent messages, plan, commands, diffs, and approvals.
- Sequence-based reconnect and HTTP catch-up.
- The minimum safe subset required for recruited-pair use: worktree isolation, local
  policy validation, exact approval evidence, role/capability enforcement,
  redaction/visibility classification, and retention disclosure.

Exit criterion: two people on different networks complete a real coding task together.

Product gate: at least 10 recruited pairs complete the acceptance scenario, at least
6 pairs make a meaningful collaborator intervention, and at least 5 hosts say they
would use Huddle again for a real task. Failure pauses Phase 2 feature expansion and
triggers problem/positioning research; it does not automatically reframe the product.

### Phase 2: safe beta

Add:

- Hardened and configurable worktree isolation.
- Expanded local policy and approver configuration.
- Tunable redaction, visibility, and organization policies.
- Archive and export.
- Self-hosted container.
- Operational metrics and recovery UX.

Exit criterion: a small engineering team can use Huddle repeatedly without developer intervention.

### Phase 3: provider expansion

Add OpenCode first, then Claude Code and ACP based on capability quality and demand.

## 20. Acceptance test scenario

A complete version 1 acceptance test:

1. Alice runs `npx huddle codex` in a repository.
2. Huddle creates a worktree, starts Codex, and returns a room URL.
3. Bob joins using a one-time invite.
4. Bob watches Alice ask the agent to diagnose a failing test.
5. Both see the agent plan, test command, output summary, and proposed file changes.
6. Bob posts a suggestion that the edge case involves timezone conversion.
7. Alice accepts the suggestion and sends it as in-flight steering.
8. Bob requests driver control; Alice hands it to him.
9. Bob asks the agent to add a regression test.
10. The agent requests a network operation. Bob cannot approve it because he lacks that capability.
11. Alice approves the exact request as owner.
12. The browser disconnects and reconnects; no events are lost or duplicated.
13. The run completes, and both inspect the cumulative diff and command summary.
14. Alice exports a Markdown summary and archives the room.
15. Neither Bob nor the control plane ever receives shell access, provider credentials, or the full repository.

## 21. Decisions made

1. Execution is local by default.
2. The easiest hosted experience uses an outbound connection to a control plane.
3. Codex is the first provider.
4. Huddle starts and owns its provider process in version 1.
5. One driver controls the agent at a time.
6. Suggestions and comments remain multiplayer even while control is serialized.
7. Approval authority is separate from driver authority.
8. No raw remote shell is exposed.
9. A worktree is created by default.
10. The event history is ordered, durable, and reconnectable.
11. The system is open source and self-hostable.
12. Provider-native capability differences are shown honestly.
13. Huddle remains a synchronous live-room product; an asynchronous exception inbox
    is not part of version 1.
14. The provider adapter is generated and tested against explicit Codex App Server
    schema versions rather than relying on an unversioned event contract.
15. Privacy language distinguishes local execution and credentials from the
    structured project data intentionally relayed to participants and the control
    plane.
16. Delivery is a staged modular vertical slice with product validation gates, not a
    simultaneous build of every version 1 subsystem.

## 22. Open product decisions

These decisions can be finalized after the vertical slice:

- Whether anonymous guest access should exist or all guests should verify an email/GitHub identity.
- Whether hosted Huddle should retain command output and diffs by default or require explicit room opt-in.
- The default driver-lease duration.
- Which low-risk command categories may be auto-approved.
- Whether archived read-only rooms should support public links.
- Whether the first release should include pull-request creation or keep it in version 1.1.
- The final product name and package name.

None of these decisions blocks the core architecture.

## 23. Competitive position

Huddle is intentionally narrower than a decentralized agent network, collaboration suite, or multiplayer terminal:

| Product shape | Primary value | Main cost |
|---|---|---|
| Codex app and mobile/web continuation | Personal multi-agent orchestration and remote continuation | Does not make a second human a first-class driver or approver in the same local run |
| Meet AI-style shared rooms | Cross-provider collaborative agent sessions | Product maturity and safety semantics vary; differentiation cannot rest on rooms alone |
| GitHub/Codespaces collaboration | Repository-native review and shared development environments | Requires a cloud/dev-environment workflow rather than joining a host-local agent run |
| Decentralized agent network | Portable identity, signed authorship, open relays | Identity and relay complexity |
| Multiplayer terminal | Shared access to a machine session | Collaborators gain broad host capability |
| Screen sharing | Immediate observation | No structured control, history, or approvals |
| Huddle | Structured shared control of a local agent | Host must remain online |

The initial wedge is not a proprietary agent or the existence of a shared room. It is
the second human as a first-class actor in a host-local run: attributable input,
explicit driver transfer, separately delegated approval authority, and replayable
evidence. This is a product advantage to validate, not a durable moat claim.

## 24. Final product definition

Huddle version 1 is complete when:

> An engineer can start Codex in an isolated repository worktree with one command, invite a teammate with one link, collaborate through structured observation and explicit driver handoff, safely resolve approvals, survive reconnects, and export the resulting history—without exposing a remote shell or moving credentials and execution into the cloud.

## 25. CEO review lock and premise ledger

This section records the July 28, 2026 `/autoplan` CEO review. Two independent
Codex review paths challenged the premise before implementation planning. Both
recommended considering an asynchronous exception/governance inbox because
official agent products increasingly cover personal remote continuation and
multi-agent orchestration. The product owner explicitly selected the original
live-room thesis. That decision is settled for this plan and must not be
re-litigated during design, engineering, or developer-experience review.

| Premise | Current evidence | Risk | Validation |
|---|---|---|---|
| Two humans want to operate one local agent synchronously | Founder thesis and adjacent collaboration products; no Huddle usage data yet | High | Recruit 10 pairs for the Phase 1 gate |
| A second human needs control, not only observation | Existing screen sharing and personal remote-control flows do not provide attributable shared control | High | Measure accepted suggestions, handoffs, and approvals |
| Local execution is a material trust advantage | Credentials and execution remain local, but structured project data is relayed | Medium | Test comprehension in onboarding and privacy interviews |
| A one-command room overcomes destination-app friction | No repository integration or notification loop in V1 | High | Measure time-to-room, invite conversion, and repeat rooms |
| Role-separated approvals add useful governance | Additional ceremony may slow small teams | Medium | Measure decision latency and approval abandonment |
| Codex App Server is a viable first adapter | Current installed schema exposes turn start/steer/interrupt and approval methods | Medium | Generate schemas per supported Codex version and run contract fixtures |

Decision rule: weak Phase 1 product metrics pause feature expansion. They trigger
customer research and positioning review, not an automatic change to the live-room
thesis.

## 26. Existing leverage and implementation approach

The repository is greenfield: it contains this specification and project guidance,
but no application code, package manifest, tests, or reusable services. The plan
therefore reuses external primitives rather than pretending local code exists:

- Codex App Server JSON-RPC methods and generated schemas for structured events,
  steering, interruption, and approvals.
- Git worktrees for workspace isolation.
- PostgreSQL transactions, unique constraints, and monotonic room sequences for
  durable ordering and idempotency.
- Standard outbound WebSocket connectivity plus HTTP catch-up.
- GitHub OAuth identity and organization membership, with authorization still
  enforced by Huddle capabilities.

Three approaches were considered:

| Approach | Shape | Advantage | Cost | Decision |
|---|---|---|---|---|
| Local demo first | One runner and a minimal browser relay | Fastest proof | Encourages protocol and persistence shortcuts | Rejected |
| Staged modular vertical slice | Monorepo, stable Huddle schemas, generated provider boundary, local journal, then hosted slice | Tests the complete value loop while keeping boundaries replaceable | Requires early contract discipline | Selected |
| Full platform first | Build all V1 roles, retention, self-hosting, and provider abstractions together | Broad launch surface | Delays learning and multiplies failure modes | Rejected |

The selected approach preserves the full product destination while sequencing risk.
Phase gates control when the team earns the right to add breadth.

## 27. Dream state and temporal interrogation

```text
CURRENT                     THIS PLAN                         12-MONTH IDEAL
spec only              ->   Codex live-room V1          ->   trusted team control layer
no user evidence            10-pair validation gate          repeated team workflows
one provider target         versioned adapter boundary        capability-graded adapters
host must stay online       explicit online-state UX          optional persistent runners
destination room            share link + resumable room       repo/PR entry points
```

Time-horizon decisions:

- **First hour:** prove generated Codex types, event normalization, and local journal
  replay before choosing UI frameworks around guessed payloads.
- **First week:** complete the local two-client slice, including failure and approval
  paths, before control-plane persistence.
- **First month:** run the full acceptance scenario with recruited pairs; instrument
  participant join and meaningful intervention.
- **Six months:** expect official agent clients to absorb more personal remote-control
  features. Huddle must win on second-human identity, delegation, and evidence.
- **Twelve months:** add provider breadth only when the Codex experience repeats and
  the normalized contract has survived real version changes.
- **Reversibility:** provider bindings, hosted transport, auth provider, and storage
  implementation are replaceable; room/event semantics and public export formats
  require explicit versioning because users build history on them.

## 28. Reviewed system architecture

```text
 HOST MACHINE                                   HOSTED CONTROL PLANE
 ┌─────────────────────────────┐                ┌────────────────────────┐
 │ CLI / runner                │ outbound TLS   │ API + WebSocket gateway│
 │ ┌──────────┐ ┌────────────┐ │───────────────>│ auth / capability check│
 │ │ worktree │ │local policy│ │<───────────────│ mutation dedupe        │
 │ └──────────┘ └────────────┘ │                └───────────┬────────────┘
 │       │ exact approval hash │                            │
 │ ┌─────▼───────────────────┐ │                ┌───────────▼────────────┐
 │ │ versioned Codex adapter │ │                │ PostgreSQL event store│
 │ │ generated App Server API│ │                │ room sequence + audit │
 │ └─────┬───────────────────┘ │                └───────────┬────────────┘
 │       │ JSONL stdio          │                            │
 │ ┌─────▼──────┐ ┌──────────┐ │                ┌───────────▼────────────┐
 │ │Codex server│ │local WAL │ │                │ browser room clients  │
 │ └────────────┘ └──────────┘ │                │ timeline/control/audit│
 └─────────────────────────────┘                └────────────────────────┘
```

Boundary rules:

1. Provider-specific types end at the adapter. The shared protocol contains only
   versioned Huddle events and capability descriptors.
2. The runner is authoritative for whether an execution-affecting mutation is still
   valid locally. The control plane cannot weaken provider sandbox or local policy.
3. PostgreSQL is authoritative for durable room order; WebSocket delivery is an
   optimization over the same persisted event stream.
4. The local write-ahead journal is authoritative during disconnection and is
   reconciled idempotently on reconnect.

## 29. Data flow and shadow paths

```text
browser mutation
  -> auth + room + capability + lease validation
  -> idempotency reservation
  -> persisted room event
  -> runner delivery
  -> local policy revalidation
  -> provider request
  -> provider event
  -> normalize + redact + visibility classify
  -> local journal
  -> control-plane ingest + room sequence
  -> browser stream

shadow paths
  runner offline -> local journal -> reconnect handshake -> idempotent replay
  browser offline -> last_sequence -> HTTP catch-up -> live stream
  oversized output -> local full output + durable truncated summary
  sensitive output -> local full output + visibility-filtered/redacted event
  incompatible Codex -> startup refusal + supported-version repair guidance
```

Every client mutation carries `mutation_id`, actor, room, membership version, driver
lease identifier where applicable, and an expected room sequence. A relayed approval
also carries an immutable evidence digest over the provider request, exact command or
file change, workspace identity, relevant policy snapshot, and expiry. The runner
rejects stale, replayed, mismatched, or expired approval evidence.

## 30. State machines

```text
ROOM
creating -> waiting_for_runner -> active -> reconnecting -> active
   |                |              |             |
 failed <-----------+              +-> degraded -+
                                   +-> archiving -> archived

RUN
starting -> idle -> running -> awaiting_approval -> running -> completed
    |        ^         |              |              |
  failed     +---------+           denied         interrupted
                         \-----------> failed

DRIVER LEASE
unassigned -> requested -> active -> handoff_pending -> active(new actor)
                             |               |
                         expired/revoked ----+-> unassigned

APPROVAL
requested -> visible -> resolved(allow|deny) -> consumed
     |          |              |
   expired   revoked       rejected_stale
```

Transitions are compare-and-swap operations against the current state/version.
Terminal transitions are immutable; retries return the prior result.

## 31. Error and rescue registry

| Code path | Failure | Rescued | Rescue action | User sees | Test |
|---|---|---:|---|---|---:|
| CLI startup | Unsupported or missing Codex | Yes | Stop before room activation; show detected/supported versions and repair command | Actionable setup error | Yes |
| App Server startup | Process exits or malformed JSONL | Yes | Capture bounded diagnostics, mark run failed, preserve journal/worktree | Failed run with retry | Yes |
| Adapter | Unknown method/event after provider upgrade | Yes | Quarantine payload, emit compatibility error, never coerce into a known action | Degraded/incompatible state | Yes |
| Runner connect | Network/control plane unavailable | Yes | Exponential reconnect, local journal, no silent mutation loss | Offline banner and pending count | Yes |
| Event ingest | Duplicate mutation/event | Yes | Unique constraint returns original result | No duplicate; optional retry badge | Yes |
| Event ingest | Sequence contention | Yes | Transaction retry with bounded attempts | Brief delay, then explicit failure | Yes |
| Browser stream | Gap or reconnect | Yes | Fetch after last durable sequence, then resume stream | Reconnecting/caught-up state | Yes |
| Driver action | Stale or revoked lease | Yes | Reject before runner delivery | Control changed message | Yes |
| Approval | Wrong actor/category | Yes | Deny and audit | Permission explanation | Yes |
| Approval | Evidence changed, expired, or replayed | Yes | Runner rejects; request must be reissued | Stale approval explanation | Yes |
| Redaction | Detector fails closed | Yes | Suppress payload, retain local copy, emit metadata-only event | Hidden-content notice | Yes |
| Redaction | Detector misses a secret | Partial | Incident revocation/deletion path and audit; prevention is not guaranteed | Security incident workflow | Yes |
| Local journal | Corrupt/truncated tail | Yes | Verify checksums, truncate only invalid tail, reconcile durable prefix | Recovery notice | Yes |
| Database | Primary unavailable | Yes | Reject writes, retain runner journal, serve bounded read-only state if safe | Degraded read-only room | Yes |
| Archive/export | Partial generation | Yes | Immutable snapshot boundary and retryable job | Export failed/retry | Yes |

No known reviewed path is both unrescued and silent. Secret redaction remains
defense-in-depth; it must never be represented as a guarantee.

## 32. Security threat review

| Threat | Required control |
|---|---|
| Stolen invite | One-time, short expiry, room-bound exchange; revoke on use |
| Revoked member replays a mutation | Membership version and actor bound into every mutation |
| Stale driver continues steering | Lease ID plus compare-and-swap state check at control plane and runner |
| Approver authorizes one command but another runs | Content-addressed approval evidence verified locally immediately before execution |
| Control plane fabricates or broadens approval | Runner-issued request nonce, local policy check, signed/bound response, single consumption |
| Browser requests arbitrary shell input | Closed, schema-validated operations only; no PTY or generic process endpoint |
| Agent output injects UI actions | Render as untrusted content; never interpret output as control messages |
| Cross-room event disclosure | Room-scoped queries, subscriptions, encryption context, and authorization tests |
| Secret appears in diff/output | Local redaction and visibility classification before relay; incident deletion/revocation tooling |
| Compromised dependency/package name | Lockfile, provenance checks, release signing, minimal install scripts |
| Denial of service via output/event flood | Bounded queues, payload limits, truncation, rate limits, backpressure |

## 33. Interaction edge cases

| Situation | Required experience |
|---|---|
| Invite opened before runner is ready | Join a waiting room with clear host status; do not show a broken timeline |
| Two people request driver simultaneously | Display deterministic order and current holder; only one lease transition succeeds |
| Driver closes browser mid-turn | Turn continues; lease enters grace period, then becomes requestable |
| Approver goes offline | Show who can approve, expiry, and a non-blocking deny/cancel path |
| Host laptop sleeps | Participants see host offline and last durable event; inputs cannot imply delivery |
| Large diff/output | Progressive summary and explicit truncation with local-only retrieval guidance |
| Participant loses permission while viewing | Immediately stop stream, clear mutation controls, and require reauthentication |
| Room archived during reconnect | Reconnect lands in immutable archived state, never recreates an active room |
| Mobile/narrow browser | Observation, comments, suggestions, approval review, and handoff remain usable at 320 CSS px |
| Keyboard/screen reader use | Focus follows new actionable states only on request; timeline has landmarks, live-region throttling, and full keyboard control |

## 34. Performance, observability, and operations

Initial service objectives:

- p95 accepted-mutation acknowledgement below 300 ms and p99 below 1 second,
  excluding local provider execution.
- p95 persisted-event-to-connected-browser delivery below 500 ms.
- 99.9% monthly control-plane availability during private beta.
- 99.99% no-loss rate for acknowledged durable events.
- Reconnect to an immediately readable materialized room snapshot below 2 seconds at
  p95; remaining authorized history continues by cursor.
- Approval delivery-to-resolution timing is measured separately from user think time.

Bounds and storage:

- Maximum 256 KiB durable event payload after normalization; larger content becomes
  a bounded summary plus local reference.
- Maximum 2 MiB compressed per catch-up page and 16 MiB initial catch-up before the
  snapshot-plus-pagination path.
- Unique indexes on `(room_id, sequence)`, `(room_id, mutation_id)`, and provider
  event identity; membership and active-lease lookup indexes.
- Partition durable events by time only after measured table/index pressure warrants
  it; retention deletion must be batchable and observable.

Dashboards cover activation, invite conversion, meaningful intervention, repeat
rooms, runner connectivity, ingest/delivery latency, queue depth, gap recovery,
approval latency, redaction suppression, adapter incompatibility, and storage growth.
Runbooks cover provider incompatibility, control-plane outage, database failover,
suspected secret disclosure, abusive room, and failed release rollback. Operators
must diagnose transport and state health without reading source content.

## 35. Deployment and rollback

```text
merge -> schema/contract tests -> migration compatibility check
      -> canary control plane -> synthetic two-client room
      -> 5% runners/browsers -> SLO observation -> progressive rollout

rollback decision
  |
  +-- UI/API regression, no new writes? -> roll clients/services back
  |
  +-- additive migration already used? -> roll services back; retain columns
  |
  +-- event schema emitted? -> keep reader compatibility; disable writer by flag
  |
  +-- provider adapter broken? -> pin/disable version range; preserve local journal
```

All event and API changes follow expand/migrate/contract. A release cannot require a
coordinated browser, runner, and server update. Feature flags gate driver transfer,
remote approvals, persistence of sensitive event categories, and new adapter
versions. The emergency posture is observation-only, not permissive execution.

## 36. Scope record and implementation tasks

### Scope decisions

Accepted scope remains the supplied V1 product. The review adds correctness,
measurement, compatibility, and operational detail required to build that scope; it
does not add a new product surface.

Explicitly not in V1:

- Asynchronous cross-run exception/governance inbox.
- Multi-provider support before Codex retention and compatibility are proven.
- Persistent hosted execution or a cloud development environment.
- Pull-request-native entry points, notifications, and public room discovery.
- End-to-end encryption that prevents the control plane from processing relayed
  content; current scope uses transport/storage encryption and local redaction.

### Implementation tasks

- [ ] **CEO-T1 (P1, human: ~1d / Codex: ~2h)** — Protocol — Generate and pin the Codex App Server schema; add supported-version detection and contract fixtures.
  - Surfaced by: premise ledger and architecture — App Server contracts are version-specific.
  - Files: `packages/codex-adapter/**`, generated schema directory, CI configuration.
  - Verify: fixtures pass against every declared supported Codex version; an unsupported binary fails with repair guidance.
- [ ] **CEO-T2 (P1, human: ~2d / Codex: ~4h)** — Authorization — Bind mutations and approvals to actor, room, membership version, lease, immutable evidence, expiry, and single consumption.
  - Surfaced by: security threat review — roles alone do not prevent stale/replayed or TOCTOU actions.
  - Files: shared protocol, runner policy, control-plane authorization, security tests.
  - Verify: replay, stale lease, changed command/diff, wrong room, and revoked-member tests all fail closed.
- [ ] **CEO-T3 (P1, human: ~2d / Codex: ~4h)** — Reliability — Implement durable idempotent ordering and runner/browser recovery from journals and sequence catch-up.
  - Surfaced by: data-flow shadow paths and error registry.
  - Files: event store, runner journal, reconnect API, browser state reducer, integration tests.
  - Verify: fault-injection test drops connections and duplicates messages without loss or duplicate effects.
- [ ] **CEO-T4 (P1, human: ~1d / Codex: ~2h)** — Privacy — Implement visibility classification, fail-closed redaction, truncation, retention deletion, and precise onboarding copy.
  - Surfaced by: privacy premise and redaction failure analysis.
  - Files: runner redaction pipeline, event schema, room UI, privacy documentation, tests.
  - Verify: secret corpus and authorization tests; UI accurately states which data leaves the host.
- [ ] **CEO-T5 (P1, human: ~1d / Codex: ~2h)** — Validation — Instrument the Phase 1 funnel and enforce the 10-pair product gate.
  - Surfaced by: unvalidated demand premises.
  - Files: analytics events, dashboards, beta runbook, phase-gate scorecard.
  - Verify: a synthetic acceptance run produces join, intervention, latency, completion, and repeat-room metrics without source content.
- [ ] **CEO-T6 (P2, human: ~1d / Codex: ~2h)** — Operations — Add SLO dashboards, bounded queues/payloads, compatibility alerts, incident runbooks, canary, and observation-only kill switches.
  - Surfaced by: performance and deployment review.
  - Files: service configuration, telemetry, deployment pipeline, runbooks.
  - Verify: canary and rollback drills cover provider incompatibility, database outage, and event flood.

### CEO decision audit

| Decision | Outcome | Source |
|---|---|---|
| Product unit of work | Keep the synchronous live room | User premise gate, option A |
| Review implementation voice | Codex, not Claude | User correction |
| Project instruction file | `AGENTS.md`, not `CLAUDE.md` | User correction |
| Delivery shape | Staged modular vertical slice | CEO review; preserves chosen destination |
| Asynchronous governance inbox | Explicitly not V1 | Consequence of premise gate |
| Privacy positioning | Local execution/credentials; selected structured data is relayed | Security review |
| Competitive claim | Validate a second-human wedge; do not claim a durable moat yet | CEO review |

## 37. Design review summary

The design review used two independent Codex voices because this project is being
reviewed in Codex, not Claude. No `DESIGN.md`, UI implementation, reusable component,
mockup, or configured gstack design binary exists. The text specification was
therefore reviewed with wireframes and state maps only.

| Dimension | Independent Codex | Codex CLI | After plan fixes |
|---|---:|---:|---:|
| Information architecture | 5/10 | 6/10 | 9/10 |
| Interaction-state coverage | 3/10 | 5/10 | 9/10 |
| Journey and emotional arc | 5/10 | 6/10 | 9/10 |
| AI-slop resistance | 4/10 | 6/10 | 9/10 |
| Design-system alignment | 1/10 | 2/10 | 8/10 |
| Responsive and accessibility | 3/10 | 5/10 | 9/10 |
| Resolved design decisions | 0/9 | 0/10 | 10/10 |

The remaining gap to 10/10 is empirical visual and usability validation after a
real design system and interactive prototype exist.

### Design dual-voice consensus

| Dimension | Independent Codex | Codex CLI | Consensus |
|---|---|---|---|
| Timeline must be the primary workspace | Yes | Yes | Confirmed |
| People/policy is secondary, not a fourth peer pane | Yes | Yes | Confirmed |
| Visible state coverage is insufficient | Yes | Yes | Confirmed |
| Approval review must be evidence-first | Yes | Yes | Confirmed |
| Mobile uses one surface at a time | Yes | Yes | Confirmed |
| Streaming must not steal focus or scroll position | Yes | Yes | Confirmed |
| Design system must be defined before frontend build | Yes | Yes | Confirmed |

The initial scores differed because the CLI voice credited the existing backend
state inventory more heavily. There was no directional disagreement.

## 38. Information architecture and navigation

Constraint hierarchy:

1. A decision or safety state requiring this user's action.
2. Current host/run status and what the agent is doing.
3. The next action this user is permitted to take.

Desktop at 1200 CSS px or wider:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Huddle / repo · branch     HOST ONLINE · RUNNING     Driver: Alice │
│ Policy summary                         People (2) · Settings · More │
├──────────────────────────────────────────────┬──────────────────────┤
│ TIMELINE                                     │ INSPECTOR             │
│ [Decision required: network approval]        │ Selected approval     │
│ Turn: diagnose failing test                  │ risk + exact evidence │
│ ├─ Plan update                               │ command / cwd / files │
│ ├─ Test command · passed                     │ policy + expiry       │
│ ├─ Tool activity · 3 events collapsed        │ comment               │
│ └─ Diff · 2 files                            │ Decline    Approve    │
│                                              │                       │
├──────────────────────────────────────────────┴──────────────────────┤
│ [Comment | Suggest | Queue | Steer] message…        Send / Request │
└─────────────────────────────────────────────────────────────────────┘
```

- Timeline is the persistent primary workspace.
- Inspector is a contextual 360–440 px rail. It opens for a selected event, diff,
  approval, person, or policy and can collapse without losing timeline position.
- People and policy use a drawer/popover; owner settings use a dedicated route.
- One urgent-action banner surfaces the oldest actionable approval or handoff. It
  does not hide other requests and links to a decision queue in the Inspector.
- A turn is the primary timeline group. Plan, command, tool, output, and diff events
  nest as rows; approvals, human interventions, and state transitions remain
  individually addressable.
- Every durable event has a stable permalink. Selection is encoded in the URL;
  browser Back restores the prior selection and scroll anchor.
- Auto-scroll occurs only while the viewer is at the live edge. Otherwise new events
  buffer behind an `N new events` control.

Tablet from 768–1199 px keeps the timeline and sticky composer visible; Inspector
and People become drawers.

Mobile below 768 px:

```text
┌──────────────────────────────┐
│ repo · branch   Host online  │
│ Running · Driver Alice       │
├──────────────────────────────┤
│ Decision-required banner     │
│ Timeline                     │
│ grouped event rows           │
│                              │
├──────────────────────────────┤
│ mode · message…        Send  │
├──────────────────────────────┤
│ Timeline  Inspect  People    │
└──────────────────────────────┘
```

Inspector becomes a full-height sheet/route, with Back returning to the preserved
timeline anchor. Approval and handoff use dedicated task views. Diff navigation is
file-first; long code lines scroll inside the code region rather than the page.

## 39. Visible interaction-state matrix

| Feature | Loading | Empty | Error | Success | Partial/degraded |
|---|---|---|---|---|---|
| Access/join | Identity and invite exchange progress | Waiting for runner with host explanation | Used, revoked, expired, org mismatch, or unauthorized with recovery | Joined with room orientation | Archived room or host not ready |
| Room shell | Skeleton retains known room/repo identity | Host has not connected; explain next step | Diagnostic reference and valid retry/exit | Active room | Reconnecting or readable degraded mode |
| Timeline | History loads before live attach | “Agent has not started” plus permitted primary action | Preserve loaded history; retry from last sequence | Ordered grouped events | Catching up from sequence; new events buffered |
| Composer | Permissions resolving; draft visible but disabled | Role-specific prompt | Draft retained with retry/cancel | Authored receipt with input mode and disposition | Comment/suggest allowed while queue/steer disabled offline |
| Suggestion | Submitting | No suggestions | Duplicate, rejected, or stale target | Accepted/edited/rejected receipt | Pending driver action |
| Driver | Lease state loading | No current request | Lease changed with current holder | Immutable handoff/reclaim receipt | Grace period, competing requests, or expiry warning |
| Approval | Evidence skeleton; controls disabled | No pending decisions | Unauthorized, stale, expired, revoked, or evidence mismatch | Immutable allow/deny/cancel receipt | Approver unavailable; request still pending |
| Inspector | Selection placeholder | Explain how to select an event | Selected item unavailable | Full permitted detail | Truncated, redacted, owner-only, or native detail unavailable |
| Diff | File metadata skeleton | No file changes yet | Last known diff retained with retry | Current cumulative or event diff | Binary, large, truncated, redacted, or still updating |
| Run | Provider startup progress | Idle with role-appropriate action | Interrupted/failed with retryability and diagnostic | Completed summary | Awaiting approval or host/provider degraded |
| Archive/export | Snapshot progress | Explain nothing is exportable | Retry without duplicate archive/export | Download/copy confirmation | Partial export identifies omitted hidden content |

Rules across all rows:

- Optimistic UI is limited to comments and reversible local presentation. Driver,
  approval, queue, steer, archive, and membership changes wait for authoritative
  acknowledgement.
- Duplicate submission returns the original receipt.
- Drafts persist across reconnects and viewport changes, but not across sign-out
  unless encrypted local persistence is explicitly implemented.
- State copy uses canonical terms from the room/run/driver/approval machines.

## 40. Journey and trust storyboard

| Step | User does | User needs to feel | Required support |
|---|---|---|---|
| Launch | Runs the CLI | “This will not expose my machine” | Local-versus-relayed disclosure and exact workspace |
| Create | Receives a room | “I know what I am sharing” | Repo, branch, policy, retention, and participant scope |
| Invite | Sends the link | “Only my teammate can join” | Identity requirement, expiry, revoke, and one-time status |
| Join | Opens the room | “I understand the situation” | Host, run, driver, policy, role, and latest meaningful activity |
| Observe | Follows agent work | “I can follow the story” | Turn grouping, live-edge control, bounded details |
| Intervene | Suggests or takes control | “My input had an effect” | Mode, author, acknowledgement, and final disposition |
| Approve | Reviews a request | “I know exactly what will execute” | Immutable evidence, capability explanation, expiry, receipt |
| Disconnect | Reconnects | “Nothing acknowledged was lost” | Last durable sequence and catch-up progress |
| Complete | Reviews the result | “We can act on this” | Diff, commands, unresolved items, export, retention status |

The five-second question is “Is this safe to join or share?” The five-minute
question is “Did my intervention affect the run?” The long-term question is “Can
this transcript be trusted as evidence?” Onboarding and completion must answer each.

Before room creation, the host sees and acknowledges:

- Execution, provider credentials, Git credentials, and the unredacted repository
  remain local.
- Prompts, selected structured output, diffs, approval evidence, participant
  identity, and room metadata may be relayed and stored under the shown retention.
- Redaction reduces accidental disclosure but is not guaranteed DLP.

Guests see the applicable disclosure, identity requirement, and retention before
exchanging the invite for room membership.

## 41. Visual language and design-system contract

Huddle is a calm, dense, task-focused developer tool. The visual anchor is the
timeline, not a dashboard of cards. Use one accent color and semantic status colors;
status always includes text/iconography rather than color alone.

Create `DESIGN.md` before frontend implementation with:

- Semantic variables for canvas, raised surface, text tiers, border, focus, accent,
  success, warning, danger, diff addition/deletion, redacted, and offline states.
- A non-default UI typeface and a paired monospace face; body text never below 16 px.
- A 4 px spacing scale, compact/comfortable density modes, restrained radii,
  border/elevation rules, and reduced-motion behavior.
- Named components: room shell, status strip, urgent banner, timeline turn/group/row,
  event disclosure, live-edge control, mode selector, composer, Inspector, diff
  viewer, approval evidence, role/capability display, drawer, dialog, toast, and
  empty/error state.
- Canonical content terms for `queued`, `sent`, `steered`, `applied`, `offline`,
  `reconnecting`, `stale`, `redacted`, `truncated`, `expired`, and `revoked`.

Anti-slop constraints:

- No dashboard-card mosaic, purple gradient, ornamental colored-circle icons,
  uniform bubbly containers, decorative shadows, centered workspace copy, or motion
  added only to imply polish.
- Cards exist only for atomic objects with independent action/state, such as an
  approval or suggestion. Routine command/tool events are dense rows.
- Motion communicates insertion, state transition, or spatial navigation and obeys
  reduced-motion preference.

Design litmus:

| Check | Required answer |
|---|---|
| Product unmistakable in first screen | Yes: repo/run/driver and Huddle identity |
| One strong visual anchor | Yes: timeline |
| Workspace understandable by scanning | Yes: status, turns, urgent action, composer |
| Each area has one job | Yes |
| Cards necessary | Only for atomic actionable objects |
| Motion improves hierarchy | Only where it communicates state/location |
| Premium without decorative shadows | Yes |

## 42. Responsive and accessibility contract

- Test at 320 px, 768 px, 1200 px, 1440 px, and 200% zoom.
- All essential observation, comment, suggestion, driver, approval, and diff-review
  flows work without hover or simultaneous panes.
- Composer remains above the software keyboard and preserves its draft while moving
  among Timeline, Inspect, and People.
- Minimum touch target is 44×44 CSS px. Body contrast meets WCAG AA.
- Provide semantic header/main/complementary/navigation landmarks, a skip link,
  logical source order, visible focus, and predictable focus restoration.
- Timeline is a labelled feed/list. Throttled live regions announce meaningful
  completed events, not token deltas.
- Incoming events never steal focus or move a reader who left the live edge.
- Dialogs trap focus and return it to the invoker. Sheets expose equivalent semantics
  and a labelled close/back action.
- Mode selection, event selection, Inspector, driver actions, and approvals are fully
  keyboard operable. Shortcuts are discoverable and never exclusive.
- Approval confirmation names the exact request. Allow and deny controls have
  sufficient separation; high-risk allowance requires explicit confirmation.
- Diff additions/deletions and status changes have textual labels. Code regions own
  their horizontal scroll.
- Streaming indicators respect reduced motion and expose a pause mechanism.

## 43. Resolved design decisions

| Decision | Resolution | Principle |
|---|---|---|
| Desktop shell | Timeline + contextual Inspector; People/policy on demand | One primary workspace |
| Mobile shell | One surface at a time with persistent Timeline/Inspect/People nav | Preserve essential capability |
| Timeline grouping | Turn sections; dense nested activity; independently actionable interventions | Narrative scanability |
| Scroll behavior | Auto-follow only at live edge; otherwise buffer behind count | User control |
| Composer | Explicit mode selector filtered by role, lease, run, provider, and connection; disabled modes explain why | Honest capability |
| Approval interruption | One urgent banner plus evidence-first dedicated view; composition remains unless provider is blocked | Safety without disorientation |
| Owner reclaim | Immediate server transition with confirmation for an active turn; displaced driver gets receipt and retained draft | Authority with humane recovery |
| Privacy disclosure | Before host creates/share link and before guest joins | Informed consent |
| Hidden/native output | Only locally classified bounded fields are retrievable; hidden reasons are visible | Least privilege |
| Guest entry | Invite policy is evaluated first, then identity/org constraints; errors never reveal unauthorized room data | Secure recovery |
| Retention | Exact deletion date visible in room settings, archive, and export | Predictability |
| Design language | Calm dense tool UI, timeline anchor, restrained semantic color | App-specific hierarchy |

Design-specific items not in V1:

- Decorative marketing site or brand campaign.
- Customizable room themes or user-selected fonts.
- Spatial/multiplayer cursors, avatars moving through the timeline, or celebratory
  motion.
- Mobile owner administration beyond the settings route needed for essential
  participant and policy actions.

## 44. Design implementation tasks

- [ ] **DES-T1 (P1, human: ~1d / Codex: ~2h)** — Design system — Create `DESIGN.md` with semantic tokens, density, typography, components, motion, and content rules.
  - Surfaced by: design-system pass — no reusable visual contract exists.
  - Files: `DESIGN.md`, web theme/tokens, component documentation.
  - Verify: every V1 component/state maps to named tokens; contrast meets WCAG AA.
- [ ] **DES-T2 (P1, human: ~1d / Codex: ~2h)** — Room shell — Implement and test desktop, tablet, and mobile wireflows plus selection/back behavior.
  - Surfaced by: information architecture — four peer regions did not fit narrow screens or establish hierarchy.
  - Files: room routes/layout, Inspector/drawer navigation, responsive tests.
  - Verify: acceptance flow succeeds at 320, 768, and 1440 px without hidden actions.
- [ ] **DES-T3 (P1, human: ~2d / Codex: ~4h)** — UI states — Implement the complete visible-state matrix with canonical labels.
  - Surfaced by: state-coverage pass — backend states lacked visible loading/error/degraded behavior.
  - Files: room state reducer, feature components, component fixtures/tests.
  - Verify: each feature renders loading, empty, error, success, and degraded fixtures.
- [ ] **DES-T4 (P1, human: ~1d / Codex: ~2h)** — Control UX — Build evidence-first approval and explicit driver flows.
  - Surfaced by: interaction review — stale, competing, expired, reclaimed, and unauthorized paths were unspecified.
  - Files: approval, driver, urgent-banner components and end-to-end tests.
  - Verify: keyboard-only users can distinguish, resolve, and audit exact requests.
- [ ] **DES-T5 (P1, human: ~1d / Codex: ~2h)** — Trust — Add accurate host/guest data, identity, invite, and retention disclosure.
  - Surfaced by: journey review — safety claims lacked a user-facing consent moment.
  - Files: CLI/create flow, pre-room join flow, privacy copy tests.
  - Verify: usability participants can correctly state what stays local and what is stored.
- [ ] **DES-T6 (P1, human: ~1d / Codex: ~2h)** — Accessibility — Implement landmarks, focus, live-region, diff, zoom, touch, and reduced-motion contracts.
  - Surfaced by: responsive/accessibility pass.
  - Files: room components, accessibility utilities, automated and manual test scripts.
  - Verify: automated checks plus keyboard and screen-reader acceptance scenario pass.
- [ ] **DES-T7 (P2, human: ~1d / Codex: ~2h)** — Timeline — Implement turn grouping, virtualization, permalinks, scroll anchors, and live-edge buffering.
  - Surfaced by: information architecture and large-room review.
  - Files: timeline model/components, virtualizer integration, performance tests.
  - Verify: a 10,000-event room remains scannable and never moves a paused viewport.
- [ ] **DES-T8 (P2, human: ~1d / Codex: ~2h)** — Prototype — Validate the full two-person flow across roles and viewports.
  - Surfaced by: final design score — text decisions require empirical validation.
  - Files: interactive prototype or implemented vertical slice, research script/results.
  - Verify: host, collaborator, viewer, and approver complete handoff, approval, reconnect, and review on desktop and mobile.

### Design decision audit

| Decision | Classification | Principle | Rationale |
|---|---|---|---|
| Timeline-first hierarchy | Auto-decided | Constraint worship | Both voices agreed; supports the supplied room model |
| Contextual Inspector and People drawer | Auto-decided | Simplicity/reversibility | Avoids four competing permanent panels |
| One-surface mobile model | Auto-decided | User value | Keeps all essential flows at 320 px |
| Evidence-first approval | Auto-decided | Security | Reduces ambiguous or accidental authorization |
| Explicit local-versus-relayed disclosure | Auto-decided | Trust | Required for informed sharing |
| Dense tool UI anti-slop direction | Auto-decided | Product specificity | Fits a streaming developer workspace |
| Design-system artifact before frontend | Auto-decided | Maintainability | Greenfield UI otherwise invents inconsistent primitives |

## 45. Engineering review summary

Two independent Codex engineering voices found the architecture viable but unsafe
to implement before its distributed-effect boundaries are explicit. They agreed on
all major gaps.

| Dimension | Independent Codex | Codex CLI | Consensus |
|---|---|---|---|
| Locally verifiable approval identity required | Yes | Yes | Confirmed |
| Runner epoch fencing required | Yes | Yes | Confirmed |
| Durable mutation is not provider application | Yes | Yes | Confirmed |
| Catch-up/live handoff has a race without a high-water mark | Yes | Yes | Confirmed |
| Local journal needs a real WAL contract | Yes | Yes | Confirmed |
| Worktree alone is not a security sandbox | Yes | Yes | Confirmed |
| Multi-node delivery needs transactional outboxes | Yes | Yes | Confirmed |
| Mixed-version protocol tests are required | Yes | Yes | Confirmed |

Initial engineering completeness is 5/10: the boundaries exist, but several
guarantees were prose rather than enforceable protocols. The additions below raise
the plan to 9/10; the remaining point depends on executable fault-injection evidence.

### Codebase reality and existing leverage

The repository has no implementation, package manifest, test runner, CI,
deployment configuration, or Git history. There is no local code to preserve or
refactor. External leverage remains Codex App Server, Git worktrees, PostgreSQL,
SQLite for constrained self-hosting, WebSocket/HTTP, and GitHub OAuth. Because the
system necessarily spans more than eight files and two services, the staged gates
and one-way module dependencies are mandatory protections against a big-bang build.

Recommended greenfield map:

```text
apps/
  web/
  control-plane/
packages/
  cli/
  protocol/       # discriminated schemas, state machines, error codes
  runner-core/    # WAL, sync, policy, redaction, worktree
  codex-adapter/  # generated App Server boundary and fixtures
  persistence/    # PostgreSQL/SQLite ports and conformance suite
  authz/          # capabilities, leases, signed approval evidence
  testkit/        # fake clocks, fault transport, provider fixtures
deploy/
  container/
  migrations/
```

Apps depend on packages; `protocol` depends on no application module. Provider
adapters implement protocol ports and retain native facts rather than forcing a
premature lowest-common-denominator abstraction.

## 46. Durable command and event architecture

```text
                                  CONTROL PLANE
 Browser
   │ HTTP/WS
   ▼
┌───────────────┐
│ API/Auth node │ capability + aggregate-version checks
└───────┬───────┘
        │ one PostgreSQL transaction
        ▼
┌──────────────────────────────────────────────────────────────┐
│ PostgreSQL                                                   │
│ mutation receipt + room sequence + event + transactional     │
│ runner outbox + browser outbox + materialized projections    │
└───────┬────────────────────────────────────┬─────────────────┘
        │ LISTEN/NOTIFY wake-up only         │ cursor reads
        ▼                                    ▼
┌──────────────────┐                  ┌──────────────────┐
│ Runner WS hub    │                  │ Browser WS hub   │
│ epoch-fenced     │                  │ auth per delivery│
└────────┬─────────┘                  └──────────────────┘
         │ mutation + effect attempt + runner epoch
         ▼
                                  HOST
┌──────────────────────────────────────────────────────────────┐
│ exclusive room lock -> runner inbox dedupe -> local WAL      │
│ -> policy/lease/signed-evidence validation -> Codex adapter  │
│ -> local WAL -> redact/classify -> server ingest + receipt   │
└────────────────────────────────┬─────────────────────────────┘
                                 │ JSONL stdio
                                 ▼
                          ┌──────────────┐
                          │ Codex server │
                          └──────────────┘
```

PostgreSQL is the durable source of room order. `LISTEN/NOTIFY` is only a wake-up
hint; nodes always fetch transactional-outbox rows by cursor. The runner WAL is the
durable source of host-originated facts until control-plane acknowledgement.

### Runner ownership and fencing

- Room activation uses compare-and-swap to increment `runner_epoch`.
- The host also holds an exclusive local lock for the room/provider process.
- Every heartbeat, dispatch, WAL record, acknowledgement, provider effect, and
  ingested event carries `room_incarnation` and `runner_epoch`.
- Server and runner reject stale epochs. A replaced runner is disconnected and
  becomes incapable of execution, not merely hidden from the UI.
- Archive creates a terminal room incarnation; resume creates or reacquires only
  according to the documented state transition.

### Mutation/effect lifecycle

```text
received -> authorized -> durable -> dispatched -> runner_durable
         -> provider_submitted -> applied
                               -> rejected
                               -> unknown -> reconcile | expire/reissue
```

The API returns a mutation receipt immediately after the atomic durable/outbox
transaction. Runner and provider facts update the linked effect attempt through
`causation_id`. Approval intent is journaled before replying to the provider; provider
acknowledgement is journaled afterward. A crash in between yields `unknown`, never a
silent replay.

### Catch-up and visibility

1. Authenticate the stream and subscribe first.
2. Server returns a committed high-water mark and an opaque per-view cursor.
3. Buffer authorized live events above the mark.
4. Fetch authorized events through the mark in pages bounded by compressed bytes.
5. Drain the buffer by event identity and continue live.

Room-global internal sequences remain server-side. Clients receive opaque cursors or
authorized tombstones so hidden owner/approver events neither leak details nor create
endless apparent gaps. Authorization is checked for each query, subscription,
delivery, reconnect, archive, and export snapshot. Revocation forcibly terminates all
member sockets across nodes.

## 47. Local WAL and workspace containment

The runner journal is a segmented framed WAL:

```text
segment header: magic | WAL version | room incarnation | runner epoch
record: length | record version | record ID | record type | payload | CRC
checkpoint manifest: last durable record | last server ack | segment set | checksum
```

- Single writer owns the local room lock.
- Files and directories are `0600`/`0700`; Huddle metadata lives outside the
  repository and worktree.
- Execution-affecting inbound intent is fsynced before provider submission.
  Host-originated durable facts are fsynced before being reported as durable.
- Segment rotation and checkpoint replacement are atomic. Compaction writes a new
  generation and swaps the manifest only after fsync.
- A corrupt tail is truncated to the last verified frame. Corruption inside an
  acknowledged prefix fails closed and requires explicit recovery.
- Disk full, permission loss, or fsync error disables new execution-affecting remote
  input and surfaces `Host storage unavailable`; observation may continue from the
  durable prefix.
- WAL readers support the current and previous version. Rollback cannot strand a WAL
  written by the canary.

Workspace containment:

- Canonicalize the repository and worktree roots and re-check every affected path
  after symlink resolution.
- Reject cwd/file operations escaping the worktree. Test symlinks, nested repos,
  alternate worktrees, submodules, case-folding, and traversal.
- Define submodules as read-only and uninitialized by default; explicit initialization
  is a policy-gated network/filesystem action.
- Do not run repository Git hooks for Huddle-managed Git operations. Sanitize Git
  config and credential-helper use for remote operations.
- Sanitize inherited environment and executable lookup; do not trust writable PATH
  entries, repository-local binaries, temporary sockets, or `/tmp` merely because a
  worktree exists.
- Exercise the effective Codex sandbox in security tests. Configuration assertions
  are insufficient.
- `--no-worktree` displays and records a weaker-isolation warning and cannot be the
  default hosted onboarding path.

## 48. Protocol compatibility and error contract

Browser, server, runner, WAL, and adapter negotiate:

- Minimum and maximum protocol version.
- Required and optional capabilities.
- Minimum reader version for each durable event type.
- Codex App Server version and generated-schema fingerprint.

Changes are additive across the current/previous compatibility window. Readers store
and skip unknown optional events; unsupported required execution semantics force
observation-only mode with upgrade guidance. Writers are feature-gated until the
connected fleet can read them.

Every surfaced error has:

```text
stable machine code
safe user message: problem + likely cause + next action
retryable flag and retry-after where meaningful
content-free diagnostic ID
documentation slug
```

Raw provider, filesystem, database, or network exceptions never cross the trust
boundary. Time, UUID generation, and retry schedules are injectable so expiry and
recovery tests are deterministic.

## 49. Engineering failure registry

| Code path | Failure | Rescued | Test | User sees | Logged |
|---|---|---:|---:|---|---:|
| Approval identity | Control plane fabricates an approver | Yes: locally pinned device signature/grant | Yes | Security failure; no execution | Yes |
| Approval consumption | Crash between provider response and receipt | Yes: durable intent then `unknown` reconciliation | Yes | Stale/reissue state | Yes |
| Runner takeover | Old and new runners remain connected | Yes: epoch and local lock | Yes | Old runner disconnected | Yes |
| Mutation | Durable intent never reaches/applies to provider | Yes: explicit effect lifecycle | Yes | Saved/delivered/applied/failed accurately | Yes |
| Live attach | Event commits across fetch/subscribe boundary | Yes: high-water buffering | Yes | No gap | Yes |
| Visibility | Hidden event creates apparent sequence gap | Yes: opaque cursor/tombstone | Yes | Continuous authorized history | Yes |
| WAL | Disk fills or durability call fails | Yes: execution fails closed | Yes | Host storage unavailable | Yes |
| WAL | Corrupt tail/middle or failed compaction | Yes: framed recovery or explicit block | Yes | Recovery diagnostic | Yes |
| Membership | Revoked socket continues on another node | Yes: per-delivery auth and forced disconnect | Yes | Immediate access removal | Yes |
| Workspace | Symlink/submodule/cwd escapes root | Yes: canonical path policy | Yes | Exact blocked path/capability | Yes |
| Provider | Action may have executed but outcome is lost | Partial: `unknown`, never blind retry | Yes | Reconcile/reissue guidance | Yes |
| Provider IPC | Malformed/oversized output or process death | Yes: bounds, quarantine, synthesized terminal event | Yes | Degraded/failed run | Yes |
| Event schema | Old client receives required new semantics | Yes: handshake and observation-only fallback | Yes | Upgrade guidance | Yes |
| Outbox | Notification is lost or node restarts | Yes: durable cursor replay | Yes | Delayed then recovered | Yes |
| Export | Membership changes during generation | Yes: immutable snapshot/visibility boundary | Yes | Stable audited export | Yes |

After these additions there is no known row that is unrescued, untested, and silent.
The `unknown` provider outcome is deliberately visible because the provider boundary
cannot always prove exactly-once application.

## 50. Mandatory test plan

Current executable coverage is 0 because no code or test framework exists. Adopt:

- Vitest for unit, contract, state-machine, and persistence-conformance tests.
- `fast-check` for ordering, idempotency, version, and transition properties.
- Playwright for browser flows and accessibility.
- Testcontainers PostgreSQL for real transactional and multi-node integration.
- Deterministic fake Codex App Server plus versioned captured fixtures and
  current-binary smoke tests.
- Fake clock/ID source and a fault transport supporting drop, duplicate, reorder,
  backpressure, partition, and process death.

```text
CODE PATHS                                      USER FLOWS

CLI launch [0/8]                                Create/join [0/7] -> E2E
├─ repo/worktree/malicious repo                 ├─ OAuth/invite/org branches
├─ Codex absent/compatible/incompatible         └─ runner waiting/ready/offline
└─ WAL writable/corrupt/disk full

Mutation pipeline [0/12] -> E2E                 Collaborate [0/10] -> E2E
├─ auth/room/role/aggregate versions            ├─ comment/suggest/queue/steer
├─ dedupe same/different body                   ├─ double-submit/two tabs
├─ online/reconnect/stale epoch                 └─ handoff/reclaim/expiry
└─ durable/dispatched/applied/rejected/unknown

Approval pipeline [0/13] -> E2E                 Approval UX [0/9] -> E2E
├─ signer/grant/room/category/version           ├─ authorized/unauthorized
├─ exact/changed/expired/replayed evidence      ├─ stale/expired/revoked
├─ local policy allow/deny                      └─ disconnect/double decision
└─ provider accept/disappear/ambiguous

Provider adapter [0/11]                         Timeline/reconnect [0/9] -> E2E
├─ init/error/overload/malformed/oversized      ├─ attach-boundary event
├─ known/unknown/breaking event                 ├─ duplicate/gap/reorder
└─ steer/interrupt/approval/process-exit races  └─ live edge/10k room

Journal/sync [0/12]                             Privacy/export [0/9] -> E2E
├─ append/fsync/crash/corruption/disk full      ├─ visibility/revocation
├─ replay/server ack/compaction                 └─ redaction/export/retention
└─ WAL current/previous version

Event store [0/12]                              Accessibility [0/8] -> E2E
├─ sequence/dedupe/outbox rollback              ├─ keyboard/screen reader
├─ pagination/visibility/archive/retention      └─ 320px/zoom/focus/motion
└─ PostgreSQL/SQLite conformance

Compatibility [0/8]
├─ current/current
├─ previous runner/current server/browser
├─ current runner/previous server
├─ missing required capability
└─ unknown optional event round-trip

TOTAL: 0/128 executable paths; 17 cross-component E2E paths
```

Required invariants:

- At most one active runner epoch and driver lease per room incarnation.
- An approval nonce is consumed at most once and only for its exact evidence/grant.
- Every acknowledged durable mutation has one terminal visible effect status.
- Every authorized durable event is eventually readable exactly once in ordered
  projection despite duplicate delivery.
- Archive and revocation prevent all later execution and unauthorized delivery.

Tests assert both observable histories and fake/real provider effects. Linearizability
checks cover driver transitions, approval consumption, runner takeover, archive, and
revocation. Crash tests inject failure before and after every durability boundary.

The durable test-plan artifact is
`~/.gstack/projects/huddle/test-plan-2026-07-28-huddle.md`.

## 51. Performance corrections

- Replace the inconsistent `10,000 × 256 KiB in two seconds` implication with pages
  of at most 2 MiB compressed and an initial catch-up budget of 16 MiB. Above that,
  serve a materialized snapshot then cursor pages.
- Store incremental file-change facts and periodic materialized diff snapshots;
  never rewrite the cumulative diff into every event.
- Redaction accepts bounded input, uses linear-time/RE2-class matching, enforces a
  per-record deadline, and suppresses content closed on timeout/error.
- Allocate room sequences by updating a per-room counter row in the same transaction,
  never `MAX(sequence)+1`. Monitor lock wait; one driver keeps contention bounded.
- Socket consumers have bounded queues. Slow clients disconnect with a resume cursor
  rather than retaining unbounded memory.
- Exports and retention are asynchronous, use immutable snapshot sequences, stream
  or chunk output, and delete in observable batches.

## 52. Distribution, deployment, and rollback additions

Before public beta:

- Own and protect the npm package name; document Node version, OS, architecture, Git,
  and Codex prerequisites.
- Test Linux/macOS and x64/arm64. Windows is either in the tested matrix or explicitly
  unsupported for V1 with a clear WSL path.
- Use a reproducible lockfile, dependency review, SBOM, npm provenance, signed tags,
  release checksums, and minimal lifecycle scripts.
- Publish a multi-architecture control-plane image with migration lock, readiness,
  PostgreSQL instructions, and documented SQLite volume/backup limits.
- Run current/previous browser-server-runner-WAL compatibility in CI.
- Canary a synthetic room with two browsers, one runner, handoff, signed approval,
  reconnect, revocation, archive, and export.
- Default-deny feature flags gate remote approvals, steering, runner takeover, and
  new adapter versions.
- Maintain a runner/server compatibility revocation list and actionable CLI repair.
- Never require destructive down migrations. Roll back code while retaining additive
  schema and compatible readers.
- State plainly that single-container self-hosting covers the control plane; the
  runner still executes beside the repository.

## 53. Parallel implementation lanes

| Lane | Work | Depends on |
|---|---|---|
| A | Protocol schemas, state machines, errors, compatibility fixtures, testkit | — |
| B | Codex adapter, runner WAL/sync/worktree/redaction | A |
| C | PostgreSQL/SQLite persistence, authz, leases, outboxes, WS hubs | A |
| D | Room UI and state fixtures against protocol mocks | A |
| E | npm/container CI and release pipeline | A |
| F | Integrated security, fault-injection, and E2E suite | B + C + D + E |

```text
A
├─ B ─┐
├─ C ─┼─ F
├─ D ─┤
└─ E ─┘
```

One owner controls cross-cutting protocol changes through Lane A until integration.

## 54. Engineering implementation tasks

- [ ] **ENG-T1 (P0, human: ~2d / Codex: ~4h)** — Approval security — Define device enrollment, signing, rotation, revocation, grant anchoring, exact evidence, and single-use verification.
  - Verify: wrong signer/room/category/version/evidence/expiry/replay all fail locally.
- [ ] **ENG-T2 (P0, human: ~2d / Codex: ~4h)** — Effect protocol — Implement durable mutation/outbox transactions and the complete effect lifecycle.
  - Verify: crash at every boundary yields accurate saved/delivered/applied/unknown UI.
- [ ] **ENG-T3 (P0, human: ~1d / Codex: ~2h)** — Fencing — Add room incarnation, runner epoch, executor lease, and local exclusive lock.
  - Verify: stale runner cannot accept, execute, acknowledge, or ingest after takeover.
- [ ] **ENG-T4 (P0, human: ~2d / Codex: ~4h)** — Local durability — Implement framed WAL, fsync contract, recovery, disk-full behavior, compaction, permissions, and versioning.
  - Verify: deterministic crash/corruption/disk-full suite passes.
- [ ] **ENG-T5 (P0, human: ~1d / Codex: ~2h)** — Reconnect — Implement high-water catch-up, live buffering, opaque visibility cursors, and byte paging.
  - Verify: boundary commit, hidden event, duplicate, reorder, and revocation tests pass.
- [ ] **ENG-T6 (P0, human: ~2d / Codex: ~4h)** — Workspace security — Harden canonical paths, symlinks, submodules, hooks, environment, executable lookup, and weak-isolation mode.
  - Verify: malicious-repository corpus cannot escape the selected workspace/policy.
- [ ] **ENG-T7 (P1, human: ~2d / Codex: ~4h)** — Persistence/fanout — Implement transactional sequences, causal links, outboxes, multi-node routing, and per-delivery authorization.
  - Verify: Testcontainers multi-node failure and revocation suite passes.
- [ ] **ENG-T8 (P1, human: ~2d / Codex: ~4h)** — Protocol — Build runtime discriminated schemas, canonical reducers, stable errors, clocks/IDs, and compatibility negotiation.
  - Verify: exhaustive handlers, property tests, and previous/current matrix pass.
- [ ] **ENG-T9 (P1, human: ~2d / Codex: ~4h)** — Test foundation — Install unit/property/E2E/integration tooling, fake Codex, fake clock, and fault transport; cover all P0 branches.
  - Verify: CI reports the test-plan branches and has no critical silent gap.
- [ ] **ENG-T10 (P1, human: ~1d / Codex: ~2h)** — Performance — Add byte budgets, snapshots, bounded queues, redaction deadlines, and asynchronous export/retention.
  - Verify: 10k-event, slow-client, hostile-redaction, reconnect-storm, and export load tests pass.
- [ ] **ENG-T11 (P1, human: ~2d / Codex: ~4h)** — Distribution — Build npm/container publication, platform matrix, provenance, SBOM, migrations, canary, and rollback drills.
  - Verify: clean-machine install and mixed-version canary succeed on supported platforms.
- [ ] **ENG-T12 (P2, human: ~1d / Codex: ~2h)** — Persistence parity — Run a shared semantic conformance suite against PostgreSQL and the supported SQLite subset.
  - Verify: uniqueness, transaction, CAS, cursor, retention, and snapshot cases agree.
- [ ] **ENG-T13 (P2, human: ~1d / Codex: ~2h)** — Observability — Trace mutation, dispatch, runner durability, provider effect, event, and browser receipt without content.
  - Verify: an operator resolves every registered failure from metrics and diagnostic IDs.

### Engineering decision audit

| Decision | Classification | Principle | Rationale |
|---|---|---|---|
| Participant-held approval signing | Auto-decided | Security | Required to preserve the stated distrust of the control plane |
| Explicit provider-effect lifecycle | Auto-decided | Correctness | A durable intent is not proof of execution |
| Runner epoch and local lock | Auto-decided | Safety | Prevents split-brain execution |
| High-water catch-up and opaque cursors | Auto-decided | Reliability/privacy | Closes attachment race without leaking hidden events |
| Segmented framed WAL | Auto-decided | Durability | Makes crash and disk-full promises testable |
| Transactional outbox + PostgreSQL wake-up | Auto-decided | Simplicity/reliability | Durable multi-node routing without premature broker |
| Hardened workspace policy | Auto-decided | Security | Worktree isolation alone is not containment |
| Current/previous compatibility window | Auto-decided | Reversibility | Enables canary and rollback without coordinated updates |

## 55. Developer-experience review summary

Huddle is primarily an npm-distributed CLI plus hosted browser product. It also has
two secondary developer surfaces with different needs: a self-hosted control plane
for platform engineers and an open-source contributor environment. Both independent
Codex voices agreed that these must not be collapsed into one “one command” promise.

| Dimension | Independent Codex | Codex CLI hosted/self-hosted | After fixes |
|---|---:|---:|---:|
| Getting started / CLI | 5/10 | 7/10 / 4/10 | 9/10 |
| API and command ergonomics | 6/10 | 6/10 / 5/10 | 9/10 |
| Errors and debugging | 6/10 | 8/10 / 6/10 | 9/10 |
| Documentation | 2/10 | 3/10 / 2/10 | 9/10 |
| Upgrade path | 4/10 | 7/10 / 5/10 | 8/10 |
| Developer environment | 5/10 | 3/10 / 3/10 | 9/10 |
| Community/ecosystem | 3/10 | 1/10 / 1/10 | 8/10 |
| Measurement/feedback | 6/10 | 6/10 / 2/10 | 9/10 |

Overall DX moves from 5/10 to 9/10 in the plan. It reaches 10 only after clean-machine
and observed-user validation.

### DX dual-voice consensus

| Dimension | Independent Codex | Codex CLI | Consensus |
|---|---|---|---|
| Golden path can remain one command | Yes | Yes | Confirmed |
| First collaborative effect is the real value moment | Yes | Yes | Confirmed |
| Complete CLI/output/config contract is missing | Yes | Yes | Confirmed |
| Concrete doctor/error recovery is required | Yes | Yes | Confirmed |
| Documentation is the largest current DX gap | Yes | Yes | Confirmed |
| Self-hosting needs its own operating journey | Yes | Yes | Confirmed |

### Persona and empathy

Primary persona: a product/senior engineer on a 2–20 person team who already uses
Codex locally. They tolerate about three minutes to a trustworthy room and five
minutes to visible collaborative value. They expect no networking setup, clear data
boundaries, actionable failures, and reversible cleanup.

> I want one command and one link. Before sharing, I need to know what leaves my
> laptop. If startup fails, I need one exact repair command. The product is not real
> when a URL prints; it is real when my teammate’s suggestion visibly changes Codex
> and both of us can trust the receipt.

Self-hosted persona:

> I need a reproducible deployment, explicit prerequisites, TLS and identity setup,
> persistent storage, backups, upgrades, rollback, health checks, and proof that my
> runners and server are compatible. A “single container” is packaging, not an
> operating model.

## 56. Time to value and magical moment

| Metric | Target |
|---|---:|
| New hosted user: CLI invocation to shareable ready room | median <2 min; p95 <3 min |
| Returning hosted user: invocation to ready room | median <20 sec, excluding Codex process startup |
| Ready room to second authenticated participant | median <2 min |
| CLI invocation to first meaningful applied collaborator intervention | median <5 min |
| Submitted collaborator request to applied/rejected terminal receipt | median <60 sec, excluding explicit human think time where reported separately |
| Healthy self-hosted instance: CLI invocation to ready room | same hosted runner target |
| Fresh self-host deployment to healthy synthetic room | p50 <20 min after prerequisites; p95 <45 min |

The magical moment is:

> A teammate joins from another network, submits a suggestion, the host accepts it,
> and both browsers show an attributable `applied` receipt linked to the resulting
> Codex turn.

Requirements:

1. CLI shows a timestamped progress trace from preflight through room readiness.
2. Room opens with one dominant action: copy/share the invite.
3. Joiner receives enough context to suggest immediately.
4. Host accepts the suggestion in one action.
5. Both users see author, mode, durable/delivery/application states, and result.
6. The complete path is instrumented. A fake collaborator is not substituted for
   two-person beta validation.

## 57. Nine-stage developer journey

| Stage | Developer does | Target experience |
|---|---|---|
| Discover | Finds site, GitHub, or npm | One-screen value statement, 90-second flow, Codex-first status, package identity |
| Evaluate | Checks compatibility, trust, and cost | Runtime matrix, plain data boundary, hosted beta terms, self-host requirements |
| Install | Runs `npx huddle codex` | Protected/provenance-backed package; tested clean-machine command |
| Configure/auth | Completes GitHub device/browser flow | Invite-only default; `--org` override; cancellation/headless recovery |
| Share/join | Sends and opens room URL | URL always printed; optional open/copy/QR; invite expiry/revoke and join status visible |
| Collaborate | Observes, suggests, hands off, approves | Contextual teaching; terms identical in CLI, web, events, and docs |
| Debug/recover | Handles auth, version, network, WAL, or provider failure | Problem + cause + fix + docs + diagnostic ID; metadata-only bundle |
| Upgrade/operate | Updates runner/server or self-host | Compatibility preflight, backup/migration, mixed-version window, rollback |
| Exit/migrate | Exports, archives, cleans, or changes server | Reversible export/archive/worktree cleanup and server-move guidance |

## 58. Golden-path CLI contract

The memorable path remains:

```text
npx huddle codex
```

First use defaults to invite-only. Organization restriction is an explicit
`--org <slug>` override and is not a blocking setup question before first value.
The URL is always printed even when browser opening or clipboard access fails.

Command grammar:

```text
huddle codex [options]
huddle room list
huddle room status <room>
huddle room resume <room>
huddle room archive <room>
huddle room clean <room>
huddle auth login|logout|status
huddle config get|set|list
huddle doctor [codex|auth|network|storage|compatibility]
huddle diagnostics create
```

Global options:

```text
--help --version --json --no-color --quiet --verbose
--no-open --non-interactive --server <url>
```

- Standard result data goes to stdout; progress and errors go to stderr.
- `--json` emits a versioned machine-readable result/error and disables decorative
  progress. `--non-interactive` fails with an actionable code rather than prompting.
- Config precedence is CLI > `HUDDLE_*` environment > project-safe config > user
  config > defaults. Credentials and identity tokens never enter repository config.
- Exit-code families distinguish usage, prerequisite, authentication, network,
  compatibility, policy, storage, provider, and internal failures.
- `SIGINT` states exactly whether the room, Codex process, journal, and worktree
  remain and prints the resume/clean command.
- `--no-worktree` is an explicit weaker-isolation escape hatch with a recorded
  warning. `--server` is the self-host endpoint escape hatch.
- `/v1` is an internal API in V1. Self-host administrators receive generated
  OpenAPI/event schemas for integration and debugging, but Huddle does not promise a
  stable third-party SDK/API until it is explicitly promoted.

Expected progress:

```text
[0.0s] Checking Git, Codex, Node, workspace, and local storage…
[0.4s] Signing in to Huddle…                 (or “Using saved session”)
[3.1s] Creating isolated worktree…
[4.0s] Starting Codex 0.145.x…
[5.2s] Connecting the local runner…
[5.8s] Room ready: https://…
       Invite expires in 24h. Revoke: huddle room status <room>
```

Each step has a timeout, stable progress state, cancellation semantics, and error
code. Clipboard/browser success is never part of readiness.

## 59. Error and diagnostics experience

Examples define the required rendering:

```text
HUDDLE-CODEX-001  This Codex version cannot start a Huddle room.

Found:     0.144.0 at /usr/local/bin/codex
Supported: 0.145.x
Nothing was started and no room was created.

Fix: install a supported Codex version, then run:
  huddle doctor codex

Details: https://huddle.dev/errors/HUDDLE-CODEX-001
Diagnostic: hd_7K2M
```

```text
HUDDLE-AUTH-003  GitHub sign-in expired before it completed.

No room or invite was created.
Fix: run `huddle auth login` and enter the new device code.
Headless terminal? Use `huddle auth login --no-open`.

Details: https://huddle.dev/errors/HUDDLE-AUTH-003
```

```text
HUDDLE-STORAGE-002  Huddle cannot safely record remote actions.

The local journal could not be written. Remote queue, steer, and approval
actions are disabled; Codex was not sent this request.

Fix:
  huddle doctor storage
  huddle room list --storage

Diagnostic: hd_9P4Q
```

Every registered failure maps to a catalog entry with problem, likely cause, fix,
docs, retryability, exit code, safe fields, and diagnostic fields. `--verbose`
remains redaction-safe. `huddle diagnostics create` defaults to metadata only,
previews every included field/file, requires confirmation, and never uploads
automatically. Raw stack traces remain local behind an explicit debug setting.

## 60. Documentation product

```text
README.md
docs/
  getting-started/
    host-a-room.md
    join-a-room.md
    first-collaboration.md
  concepts/
    data-boundary.md
    roles-driver-approvals.md
    delivery-vs-application.md
  guides/
    pairing.md
    supervised-run.md
    secure-approval.md
    recovery.md
  reference/
    cli.md
    config.md
    environment.md
    errors.md
    compatibility.md
    api-protocol.md
  self-host/
    quickstart.md
    configuration.md
    tls-identity.md
    backup-restore.md
    upgrades.md
    operations.md
  contributing/
    setup.md
    architecture.md
    testing.md
    release.md
  security/
    threat-model.md
    reporting.md
```

README contains the golden command, exact expected output, prerequisites, data
disclosure, support status, clean-up command, and links to longer reference. CI runs
every shell example against the declared version. Reference docs are versioned by
Huddle major and expose the current CLI/server/Codex compatibility matrix.

## 61. Upgrade, self-host, and contributor contracts

### Upgrade contract

- Publish SemVer policies for npm CLI/runner, server/container, protocol, WAL, and
  configuration.
- Support current and previous compatible runner versions against hosted service.
- Give at least one stable release of actionable deprecation warning.
- `huddle doctor compatibility` reports current, minimum, maximum, required action,
  and observation-only fallback.
- Config/WAL migrations preview changes and create a verified backup before mutation.
- Release notes group `Action required`, `Behavior changed`, and `Safe to ignore`.
- Downgrade never strands exports or worktrees; unsupported WAL downgrade stops
  before mutation with recovery guidance.

### Self-host contract

The quickstart specifies DNS/TLS or reverse-proxy requirements, base URL, GitHub OAuth
application, signing/session secrets, PostgreSQL or constrained SQLite volume,
migration lock, readiness/liveness, backup/restore, upgrade/rollback, email/notification
limitations, retention, logs/metrics, and runner/server compatibility. A synthetic
two-browser/one-runner check is the definition of healthy. Self-host telemetry
defaults off.

### Contributor contract

Pin Node and pnpm versions. The standard loop is:

```text
corepack enable
pnpm install
pnpm dev
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
```

`pnpm dev` starts web, control plane, fake identity, fake Codex, seeded rooms, and a
local PostgreSQL by default; a documented flag selects SQLite. No production
credentials are required. Provide deterministic fixtures, hot reload, source maps,
and a devcontainer or equivalent reproducible environment. CI covers Linux/macOS
x64/arm64; native Windows is out of V1 unless added to CI, with a tested WSL path.

## 62. Community and feedback system

Before public beta, add a chosen license, copyright policy, `CONTRIBUTING.md`,
`SECURITY.md`, code of conduct, governance/maintainer policy, issue templates,
supported-version policy, response expectations, roadmap, verified package publisher,
signed releases, checksums, and hosted pricing/free-beta limits.

Do not publish a general provider-plugin API in V1. Stabilize the Codex port and
release conformance tooling only after a second provider proves the abstraction.

Content-free funnel events:

```text
cli_invoked
preflight_passed | preflight_failed(error_code)
auth_started | auth_completed | auth_cancelled
room_requested | runner_ready | share_url_displayed
invite_opened | join_completed | second_participant_visible
intervention_submitted | intervention_applied | intervention_terminal
room_completed | room_archived
```

Event definitions specify start/end clocks, first-run versus returning cohort,
denominator, cancellation, timeout, and supported version/OS class. Never collect
repository names, paths, prompts, commands, diffs, or room content. Hosted analytics
has clear disclosure and opt-out; self-host telemetry defaults off. Run five observed
onboarding sessions before private beta and after every material onboarding change.

## 63. DX implementation checklist and tasks

- [ ] **DX-T1 (P0, human: ~1d / Codex: ~2h)** — Golden path — Implement exact preflight, invite-only default, progress, time budgets, URL fallback, and full collaborative-value metrics.
  - Verify: fresh supported macOS/Linux x64/arm64 hosts reach ready-room targets without cached auth.
- [ ] **DX-T2 (P0, human: ~1d / Codex: ~2h)** — Package trust — Protect the npm name, minimize lifecycle scripts, publish provenance/SBOM/signatures, and declare Node/Git/Codex support.
  - Verify: clean-machine `npx huddle codex` installs the verified package.
- [ ] **DX-T3 (P0, human: ~2d / Codex: ~4h)** — CLI — Implement command grammar, flags, config precedence, streams, JSON, exits, signals, browser fallbacks, and non-interactive mode.
  - Verify: help/output/piping/cancellation/config-conflict snapshots pass.
- [ ] **DX-T4 (P0, human: ~2d / Codex: ~4h)** — Diagnostics — Implement the safe error catalog, `doctor`, `doctor --json`, verbose mode, and previewable metadata-only bundles.
  - Verify: every failure registry row has problem/cause/fix/docs/diagnostic and redaction tests.
- [ ] **DX-T5 (P0, human: ~2d / Codex: ~4h)** — Self-host — Publish and validate deployment, TLS/OAuth/secrets, volumes, migration, health, backup, upgrade, and rollback contracts.
  - Verify: a clean deployment reaches the synthetic healthy room within the declared budget.
- [ ] **DX-T6 (P1, human: ~3d / Codex: ~6h)** — Documentation — Build README/docs architecture and execute every command example in CI.
  - Verify: a first-time host completes the acceptance task without reading the technical spec.
- [ ] **DX-T7 (P1, human: ~2d / Codex: ~4h)** — Onboarding — Guide sharing, joining, input modes, and the first applied collaborator receipt.
  - Verify: recruited pairs reach meaningful intervention in under five minutes median.
- [ ] **DX-T8 (P1, human: ~2d / Codex: ~4h)** — Upgrade — Implement version policy, deprecation, compatibility doctor, migration preview/backup, release notes, and rollback.
  - Verify: current/previous runner/server/WAL/container upgrade and rollback preserve rooms/worktrees.
- [ ] **DX-T9 (P1, human: ~2d / Codex: ~4h)** — Contributor environment — Add pinned one-command dev, fake auth/Codex, seeded fixtures, database modes, and documented CI-parity commands.
  - Verify: a new contributor runs the full local two-browser acceptance flow without production credentials.
- [ ] **DX-T10 (P1, human: ~2d / Codex: ~4h)** — Measurement — Instrument the content-free hosted funnel and opt-in/default-off self-host operator signals.
  - Verify: forbidden-content tests and beta funnel dashboard pass.
- [ ] **DX-T11 (P2, human: ~2d / Codex: ~4h)** — OSS launch — Add license, contribution/security/governance/support artifacts, roadmap, examples, and pricing disclosure.
  - Verify: every public support and release path works logged out.
- [ ] **DX-T12 (P2, human: ~1d / Codex: ~2h)** — Reference — Generate CLI/API/event reference, shell completions, upgrade rehearsals, and a segmented DX scorecard.
  - Verify: generated reference matches binaries/schemas and hosted/self-hosted metrics remain distinct.

### DX decision audit

| Decision | Classification | Principle | Rationale |
|---|---|---|---|
| Optimize first applied collaboration, not only URL creation | Auto-decided | User value | This is the first proof of the live-room thesis |
| Invite-only is the zero-config default | Auto-decided | Simplicity/security | Avoids a pre-value organization choice |
| Always print URL; browser/clipboard are optional | Auto-decided | Robustness | Headless and restricted environments remain usable |
| Stable command/config/output contract | Auto-decided | Predictability | Makes CLI scriptable and errors diagnosable |
| Internal API for V1 | Auto-decided | Scope discipline | Avoids accidental support obligations while schemas remain inspectable |
| Self-host as a separate operator journey | Auto-decided | Honest positioning | A container does not eliminate operations |
| Fake identity/provider contributor stack | Auto-decided | Zero friction | Removes production credentials from development |
| Content-free hosted analytics, self-host default off | Auto-decided | Privacy | Measures DX without source content |

DX-specific items not in V1:

- Simulated collaborator as the core onboarding substitute.
- General adapter/plugin ecosystem.
- Native Windows support without CI; a tested WSL route is sufficient.
- IDE extensions, anonymous rooms, and PR-native entry points.
- Codemods for ordinary CLI consumers; migration commands cover local metadata.

## 64. Cross-phase themes

| Theme | Phases | High-confidence conclusion |
|---|---|---|
| First collaborative effect is the product | CEO, design, DX | Measure an attributable applied intervention, not URL creation alone |
| Trust must be visible and enforceable | CEO, design, engineering, DX | Local-versus-relayed disclosure, evidence-first UI, and locally verified approval identity must agree |
| State precision is product quality | Design, engineering, DX | Canonical states and saved/delivered/applied receipts drive protocol, UI, errors, and docs |
| Recovery is a first-class path | CEO, design, engineering, DX | Offline, reconnect, crash, disk-full, version skew, and revocation need safe behavior plus an understandable next action |
| Version boundaries are unavoidable | CEO, engineering, DX | Generate Codex schemas, negotiate Huddle versions, test mixed fleets, and expose repair guidance |
| “One command” is an operational promise | CEO, engineering, DX | Package trust, clean-machine tests, observable progress, and rollback are part of the feature |
| The first slice must be safe enough for real users | Design, engineering | Worktree, policy, redaction, signed approvals, fencing, and effect receipts move into Phase 1 prerequisites |

## 65. Consolidated autonomous decision log

<!-- AUTONOMOUS DECISION LOG -->

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---:|---|---|---|---|---|---|
| 1 | CEO | Keep synchronous live-room premise | User challenge | User authority | Owner selected A after dual-voice premise challenge | Async governance-inbox pivot |
| 2 | CEO | Use staged modular vertical slice | Auto | Reversibility | Preserves product while testing full value early | Big-bang platform |
| 3 | CEO | Version generated Codex schemas | Auto | Correctness | Installed App Server contracts are version-specific | Unversioned adapter |
| 4 | CEO | State honest local-versus-relayed privacy boundary | Auto | Trust | Local execution does not mean zero project data leaves host | Absolute-locality language |
| 5 | Design | Timeline-first responsive hierarchy | Auto | Constraint worship | Both voices converged; fits narrow screens | Four peer panes |
| 6 | Design | Evidence-first approval and explicit driver UX | Auto | Safety | Makes authority and outcomes comprehensible | Generic modal/action card |
| 7 | Design | Define visible state and accessibility contracts | Auto | Completeness | Backend state labels are insufficient UI behavior | Implementation-time invention |
| 8 | Design | Create design-system contract before frontend | Auto | Maintainability | Greenfield UI has no existing vocabulary | Ad hoc components |
| 9 | Engineering | Locally anchored participant approval signatures | Auto | Security | Preserves stated distrust of control-plane identity | Trust control plane for approval actor |
| 10 | Engineering | Separate mutation receipt from provider effect | Auto | Correctness | Persisted intent cannot prove application | “Effectively once-only” provider claim |
| 11 | Engineering | Fence runners by incarnation/epoch/local lock | Auto | Safety | Prevents split-brain execution | Connection replacement alone |
| 12 | Engineering | Use high-water catch-up and visibility-safe cursors | Auto | Reliability/privacy | Closes attach race and hidden-event gaps | Fetch-then-subscribe |
| 13 | Engineering | Specify framed WAL and transactional outboxes | Auto | Durability | Makes crash recovery and multi-node delivery testable | Informal journal/notification bus |
| 14 | Engineering | Harden workspace beyond Git worktrees | Auto | Security | Worktrees are not process/filesystem sandboxes | Worktree-only claim |
| 15 | DX | Optimize and measure first applied collaboration | Auto | User value | URL creation is not multiplayer value | Room-ready-only activation |
| 16 | DX | Invite-only default; optional browser/clipboard | Auto | Simplicity/robustness | Minimizes pre-value choices and works headless | Mandatory org/browser flow |
| 17 | DX | Stable CLI/error/doctor/docs contracts | Auto | Predictability | One-command promise requires deterministic recovery | Implicit CLI behavior |
| 18 | DX | Treat self-hosting as an operator journey | Auto | Honest positioning | Container packaging does not eliminate operations | “Single container” as full story |
| 19 | DX | Keep `/v1` internal in V1 | Auto | Scope discipline | Avoids accidental public API obligations | Premature supported SDK |
| 20 | DX | Content-free hosted analytics; self-host default off | Auto | Privacy | Measures friction without source content | Content telemetry/default-on self-host |

## 66. Review completion summary

| Phase | Initial | Reviewed state | Dual-voice result | Required artifact |
|---|---:|---:|---|---|
| CEO | Premises unvalidated | 9/10 plan completeness | 6/6 strategic concerns converged; premise challenge resolved by user | Active CEO plan persisted |
| Design | 4–6/10 | 9/10 | 7/7 directions confirmed | Text wireframes/state matrix; visual prototype remains implementation validation |
| Engineering | 5/10 | 9/10 | 8/8 critical directions confirmed | `~/.gstack/projects/huddle/test-plan-2026-07-28-huddle.md` |
| DX | 5/10 | 9/10 | 6/6 central directions confirmed | Nine-stage journey, TTHW targets, CLI/docs/operator contracts |

Pre-gate checklist:

- Premise challenge, alternatives, dream-state delta, temporal review, existing
  leverage, NOT-in-scope list, and CEO artifact: complete.
- Design information architecture, visible states, journey, anti-slop, design-system,
  responsive/accessibility, decision resolution, and litmus: complete.
- Engineering architecture, code boundaries, failure registry, performance,
  deployment/rollback, test diagram, test artifact, and parallel lanes: complete.
- DX personas, empathy, competitive benchmark, magical moment, nine-stage journey,
  eight-pass scorecard, TTHW, and checklist: complete.
- Cross-phase themes and per-decision audit: complete.
- Visual mockup: unavailable because no configured gstack design binary; text-only
  specifications were produced.
- Continuous checkpoint commit: unavailable because this new repository has no Git
  author identity configured. The restore point remains available at the path in the
  opening comment; no identity was invented.

## 67. Final approval

The product owner approved this reviewed plan as-is on July 28, 2026 by selecting
option A at the `/autoplan` final gate. All recorded recommendations and
auto-decisions are accepted. Implementation must begin with the P0 foundation in
sections 54 and 63 before the shared vertical slice is treated as safe for recruited
users.
