---
name: manager-of-the-month
description: Orchestrate a substantial single-repository engineering brief from clarification through one integrated pull request. Use when the user wants Codex to understand a task completely, ask the human to resolve ambiguity, decompose the work into independent workstreams, create multiple visible Codex tasks in isolated git worktrees (not subagents), enforce discovery, implementation, and integration checkpoints, coordinate rework, and combine the resulting commits into one PR against the repository's default branch.
---

# Manager of the Month

Act as the managing Codex task. Own requirements, delegation, checkpoints,
integration, and the final PR. Delegate implementation to visible Codex tasks in
separate worktrees; never use subagents for this workflow.

Do not treat parallelism as the goal. Preserve correctness, clear ownership, and
one coherent result. Run only independent workstreams concurrently and schedule
dependencies in waves.

## Non-negotiable contract

- Manage exactly one git repository and deliver exactly one PR.
- Treat invocation with a task brief as explicit authorization to create the
  required Codex tasks/worktrees and open the final PR.
- Inspect before asking. Resolve discoverable facts from the repository instead
  of asking the human.
- Ask the human about every material product, scope, compatibility, rollout,
  security, data, or acceptance decision that cannot be discovered safely.
- Do not dispatch work until the human approves the execution charter and task
  map.
- Use `create_thread` with a project worktree for workers. Do not use
  `spawn_agent`, subagent tools, same-directory tasks, or background shell agents.
- Keep worker worktrees isolated. Never let two workers edit the same checkout.
- Require every checkpoint to pass before advancing that worker.
- Keep the managing task as the sole integration owner.
- Do not open the PR while required checks fail or acceptance criteria remain
  unmapped.
- Target the repository's discovered default branch. Never assume `main` or
  `master`.
- Do not merge the PR. Do not delete user branches, pre-existing worktrees, or
  uncommitted changes.
- Clean up every worker and integration worktree created by this run after the
  final branch and PR are safely retained.

## Phase 1: Ground the brief

Read the entire brief and inspect the repository before forming questions:

1. Locate the repository root, remotes, current status, current branch, and
   relevant uncommitted changes.
2. Read applicable `AGENTS.md` files and repository instructions.
3. Discover the remote default branch and record its current commit SHA.
4. Inspect architecture, ownership boundaries, interfaces, tests, CI, and local
   validation commands relevant to the brief.
5. Translate every sentence of the brief into one of:
   - acceptance criterion,
   - constraint,
   - non-goal,
   - dependency,
   - risk,
   - or unresolved decision.
6. Build a traceability list so no part of the brief disappears during
   delegation.

If the brief spans multiple repositories, stop and ask the human to choose one
repository or explicitly split the effort into separate invocations and PRs.

## Gate 0: Clarification and charter

Classify each uncertainty:

- **Discoverable:** inspect code, history, docs, configuration, or tests.
- **Low-risk assumption:** propose the assumption and its consequence.
- **Human decision:** ask the human before proceeding.

Ask concise clarifying questions in small batches. Prefer specific alternatives
and explain material tradeoffs. Do not ask questions whose answers are already
available locally. Continue until no material uncertainty remains.

Keep clarification proportional to the brief:

- Interpret broad adjectives such as "robust", "clean", or "production-ready"
  against repository conventions and the smallest acceptance-satisfying change.
- Do not silently expand a focused request into standards-complete support,
  adjacent features, migrations, or cleanup.
- Label optional expansion separately from decisions required to fulfill the
  brief. Recommend a bounded default.
- Before proposing a new dependency, inspect the dependency policy, lockfiles,
  runtime constraints, and existing libraries. Compare reuse, a small local
  implementation, and a new package; ask the human only when the choice is
  materially consequential.

Then present an execution charter containing:

- goal and user-visible outcome,
- acceptance criteria with stable IDs such as `AC-1`,
- scope and explicit non-goals,
- compatibility, data, security, rollout, and performance constraints,
- validation required for completion,
- assumptions,
- definition of done,
- proposed PR base branch.

Ask the human to approve or correct the charter. Do not create worker tasks
before explicit approval.

## Phase 2: Design the task map

Decompose the approved charter by cohesive ownership boundaries, not by arbitrary
file counts. Each workstream must have:

- one outcome,
- acceptance criteria it owns,
- explicit scope and non-goals,
- expected files or modules,
- interfaces it consumes or changes,
- dependencies and dependents,
- validation commands,
- checkpoint deliverables,
- one commit-ready result.

Minimize overlapping files. When overlap is unavoidable, assign one workstream
as interface owner and make dependent workers consume the agreed contract.
Separate work into dependency waves. Only tasks in the same ready wave may run
in parallel.

Include a dedicated documentation, migration, or test workstream only when it is
substantial and independently ownable. Do not create fake work merely to reach a
thread count. If fewer than two meaningful workstreams exist, explain why and
ask whether to continue without parallel delegation.

Audit the map for real concurrency before presenting it:

- Require at least one wave with two or more meaningful, independently ready
  workstreams; otherwise the map does not satisfy this skill's parallel-thread
  contract.
- Do not bundle independent documentation, fixtures, tooling, or contract-test
  work into a dependent implementation task merely for convenience.
- Do not split tightly coupled production code and its essential tests just to
  manufacture parallelism.
- If no safe concurrent wave remains after revisiting ownership and interface
  contracts, explain the serial dependency and obtain an explicit human waiver
  before proceeding.

Present the task map as a compact table with:

`ID | Outcome | ACs | Ownership | Depends on | Validation`

Also show the dependency waves and likely conflict points. Ask the human to
approve or correct the task map. This is Gate 1; dispatch nothing until it
passes.

## Phase 3: Create real worktree tasks

Use Codex thread tools, discovering their schemas with `tool_search` when they
are not already callable.

1. Call `list_projects`.
2. Match the current repository to a returned git project. If it is absent, ask
   the human to add/open it as a Codex project; do not silently use a projectless
   or same-directory task.
3. For every workstream in the first ready wave, call `create_thread` with:
   - `target.type: "project"`,
   - the matched `projectId`,
   - `target.environment.type: "worktree"`.
4. Omit `startingState` so workers start from the project default branch unless
   the human explicitly approved another existing ref. Use
   `startingState.type: "working-tree"` only when the brief intentionally depends
   on current uncommitted changes.
5. Omit model and reasoning overrides unless the human explicitly requested
   them.
6. Launch every ready worker before waiting so the wave actually runs in
   parallel.

If `create_thread` returns only a `clientThreadId`, do not pass it to tools that
require a `threadId`. Use bounded `list_threads` checks to resolve the queued
delegation by its source task and unique workstream prompt; never guess or
substitute the client ID. Use the real `threadId` and `hostId` after setup. If it
cannot be resolved, report the queued client ID as a setup blocker.

After each task becomes ready, give it a short unique title containing the brief
slug and workstream ID with `set_thread_title` when available.

Maintain an orchestration ledger in the managing task:

`workstream | threadId | hostId | wait cursor | base SHA | branch | head SHA | gate | status`

## Worker prompt: checkpoint A

Start each worker with only discovery and contract work. Include the full
approved context needed for that workstream, not the entire manager's hidden
reasoning. Use this structure:

```text
You own workstream <ID>: <outcome>.

Repository base: <default branch> at <base SHA>
Acceptance criteria: <IDs and exact text>
Scope: <owned behavior/modules>
Non-goals: <explicit exclusions>
Dependencies/interfaces: <contracts>
Validation required: <commands and expected evidence>

CHECKPOINT A ONLY. Inspect the repository and return:
- STATUS: CONTRACT_READY or BLOCKED
- restated scope and non-goals
- proposed files/modules and interface changes
- implementation plan
- validation plan
- risks, collisions, and questions for the managing task

Do not edit files, implement, or commit yet. Wait for checkpoint approval.
```

Use `wait_threads` for the active wave, up to eight targets per call. Reuse
per-thread cursors, use bounded waits, and do not busy-poll. Use `read_thread`
only when a compact wait result is insufficient.

## Gate 2: Approve worker contracts

For every `CONTRACT_READY` result, verify:

- it covers all assigned acceptance criteria,
- it respects scope and non-goals,
- ownership does not collide with another worker,
- interface changes are mutually consistent,
- its plan follows repository conventions,
- validation is sufficient.

Send corrections with `send_message_to_thread`. Advance only passing workers by
sending an explicit checkpoint approval and this implementation contract.
Allocate a unique branch name such as
`codex/manager-of-the-month/<brief-slug>/<workstream-id>` for every worker:

```text
CHECKPOINT A PASSED. Implement the approved plan.

Before reporting completion:
1. Verify HEAD still equals <approved base SHA>, then create and switch to
   <assigned unique branch>. Stop if the branch already exists at another ref.
2. Use the repository's documented local setup when dependencies are needed;
   do not change dependency manifests or lockfiles unless they are in scope.
3. Keep changes within the approved ownership boundary.
4. Add or update risk-appropriate tests.
5. Run the required validation.
6. Review the diff for unrelated changes and secret exposure.
7. Commit all work on the assigned worktree branch with a clear message.

Return:
- STATUS: IMPLEMENTATION_READY or BLOCKED
- branch name, base SHA, and head commit SHA
- concise change summary
- files changed
- acceptance-criteria evidence
- exact validation commands and results
- migrations, generated files, or operational notes
- residual risks and follow-up needs

Do not open a PR, merge, rewrite another worker's branch, or modify another
worktree.
```

Relay a worker question to the human only when it represents a genuine
undiscoverable decision. Otherwise answer it as the managing task. Start later
dependency waves only after their prerequisites reach the required gate.

## Gate 3: Accept worker implementations

For every `IMPLEMENTATION_READY` result:

1. Verify the reported branch and commit exist.
2. Inspect the commit diff and changed-file list.
3. Map evidence back to every assigned acceptance criterion.
4. Confirm tests actually ran and their results are credible.
5. Reject unrelated edits, missing commits, cross-owned changes, or weak
   validation.
6. Review risk-specific failure modes that ordinary suites may miss. For
   parsers, validators, protocol handlers, and other untrusted-input surfaces,
   exercise malformed, adversarial, and maximum-size inputs and inspect
   algorithmic scaling. Prefer deterministic operation-count or bounded-scaling
   tests over flaky wall-clock assertions.

Send failed work back to the same thread with exact evidence and a narrowly
scoped rework request. Wait for a new committed head SHA and re-run the gate.
Never mark a worker done solely because the thread says it is done.

## Phase 4: Integrate in the managing task

Do not integrate in a worker task. Protect the user's checkout:

- If the managing checkout is clean and already isolated for this effort, create
  the integration branch there.
- Otherwise create a separate main-controlled git worktree from the latest
  remote default branch. Do not stash, discard, or overwrite user changes.

Create a unique integration branch such as
`codex/manager-of-the-month/<brief-slug>`. Fetch the remote and record the final
base SHA. Cherry-pick accepted worker commits in dependency order, preserving
their commit authorship and traceability.

For a conflict:

1. Understand both intended behaviors and the owning acceptance criteria.
2. Ask the responsible worker task for guidance or a corrective commit when the
   resolution is nontrivial.
3. Resolve simple mechanical conflicts in the integration worktree.
4. Never silently choose one behavior when the conflict reveals a product
   decision.
5. Record the resolution and validate all affected workstreams.

Do not merge worker branches wholesale, include uncommitted worker state, or
copy files manually when commits can preserve provenance.

## Gate 4: Integrated verification

Run validation from the combined integration branch:

- repository-required formatting and linting,
- focused tests for every workstream,
- broader unit/integration/end-to-end suites appropriate to the blast radius,
- build or type checks,
- migration/schema validation when applicable,
- `git diff` review against the current default branch,
- secret and accidental-file review,
- adversarial and complexity checks for changed untrusted-input surfaces,
- final acceptance-criteria traceability review.

When a check fails, route the defect to its owning thread with exact reproduction
evidence, obtain and accept a fix commit, cherry-pick it, and repeat affected
checks. The integration gate passes only when all required checks pass or the
human explicitly accepts a clearly documented exception.

Immediately before publishing, fetch the default branch again. If it moved,
rebase or otherwise update the integration branch without rewriting worker
branches, resolve conflicts, and rerun affected validation.

## Phase 5: Publish one PR

Push only the integration branch. Open one PR against the discovered default
branch with `gh` or the available GitHub connector. The PR must include:

- the approved goal and outcome,
- workstream summaries,
- acceptance-criteria mapping,
- exact validation performed,
- migration, rollout, and compatibility notes,
- known risks or explicitly accepted exceptions,
- worker commit references where useful.

Verify the PR head is the integration branch, the base is the repository default
branch, and the remote diff contains the intended combined work. Do not create
per-worker PRs.

If authentication, permissions, or remote configuration prevents pushing or PR
creation, retain the completed integration branch and report the precise blocker
and next action. Never claim a PR exists without a confirmed URL or PR number.

## Phase 6: Clean up temporary worktrees

Track the absolute path of every worker and manager-owned integration worktree
when it is created. After the integration branch is pushed and the PR is
confirmed, or after a publishing blocker is documented:

1. Verify each temporary worktree is idle and clean.
2. Verify every accepted worker commit is reachable from the retained
   integration branch and that the integration branch exists locally. When
   publishing succeeded, also verify the remote integration branch contains the
   final head.
3. Preserve the integration and worker branches for PR traceability unless the
   human explicitly asks to delete them.
4. Archive the completed worker tasks with `set_thread_archived` when available.
   Archival may remove a Codex-managed worktree automatically; re-check the path
   and Git registration afterward.
5. For each recorded path that still exists, inspect untracked and ignored
   artifacts. Remove only disposable setup/build artifacts created by this run,
   then remove the worktree with `git worktree remove <absolute-path>`.
6. Preview repository-global pruning with `git worktree prune --dry-run`. Run
   `git worktree prune` only when every reported stale registration belongs to
   this run. Otherwise skip global pruning rather than touching unrelated state.
7. Verify every run-created path and registration is gone even when global
   pruning was skipped.

Never use forced removal for a dirty, locked, running, or unverified worktree.
Do not remove the calling task's active checkout. If cleanup cannot safely
complete, report the exact path, reason, retained commit/branch, and recovery
action; do not hide the residue.

## Completion report

Return:

- PR link and base/head branches,
- outcome summary,
- workstreams and final statuses,
- validation results,
- temporary-worktree cleanup results,
- accepted exceptions or residual risks,
- any worker task that remains blocked.

Emit one `::created-thread{threadId="..."}` directive for every ready worker task
created during the run. If a task never progressed beyond queued setup, emit its
`clientThreadId` form instead.

Keep worker branches for traceability; archive completed worker tasks after
their worktrees are removed. The managing task is complete only after the PR is
confirmed or a concrete external publishing blocker is documented and temporary
worktree cleanup has completed or produced a precise safe-cleanup blocker.
