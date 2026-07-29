# Phase 1 product gate (CEO-T5)

## Goal

Validate the multiplayer acceptance scenario with recruited pairs before Phase 2
feature expansion.

## Hard gate (human)

| Metric | Threshold |
|---|---|
| Recruited pairs completing the acceptance scenario | ≥ 10 |
| Pairs with a meaningful collaborator intervention | ≥ 6 |
| Hosts who would use Huddle again for a real task | ≥ 5 |

Meaningful intervention = accepted suggestion, driver handoff, or permitted approval.

## Instrumentation (content-free)

Emit only the funnel events in `@huddle/analytics` / spec § analytics. Never collect
repository names, paths, prompts, commands, diffs, or room content.

Self-host telemetry defaults **off** (`HUDDLE_TELEMETRY=off`).

## Synthetic verification (CI / local)

```bash
pnpm test:gate
```

Produces a JSON scorecard from a synthetic acceptance run so join, intervention,
latency, completion, and archive metrics are wired without human pairs.

## Beta runbook

1. Host installs CLI (`pnpm huddle` locally or `npx huddle` after publish).
2. Host runs `huddle auth login` against the beta control plane.
3. Host runs `huddle codex` in a scratch repo and shares the invite link.
4. Collaborator joins in a browser (no CLI required).
5. Collaborator comments or suggests; host accepts or hands off driver.
6. Optional approval path; archive room when done.
7. Record would-use-again (yes/no) outside the product — survey only.

## Scorecard artifact

Store pair outcomes in a spreadsheet or JSON matching `scorePhaseGate()` inputs.
Do not promote Phase 2 provider expansion until `gatePassed` is true for the human
cohort (synthetic CI runs do not satisfy the human gate).
