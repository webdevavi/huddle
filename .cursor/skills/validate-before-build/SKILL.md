---
name: validate-before-build
description: Designs and executes bounded, throwaway, end-to-end experiments that test risky product or technical hypotheses with sanitized representative inputs and production-faithful components. Use before committing to a large feature, integration, automation, AI workflow, migration, architecture, or product idea; when asked for an MVP, proof of concept, spike, prototype, feasibility test, vertical slice, pilot, or a fast way to learn whether an idea works without wasting implementation time.
---

# Validate Before Build

Maximize decision accuracy per hour, not demo polish or code volume. Build the
smallest end-to-end experiment that can honestly invalidate the idea.

## Non-negotiables

- Test one primary, falsifiable hypothesis.
- Attack the assumption most likely to kill the idea first.
- Make hypothesis-bearing surfaces real; fake unrelated surfaces explicitly.
- Use frozen, representative inputs rather than a convenient happy path.
- Define `VALIDATED`, `PARTIAL`, and `INVALIDATED` thresholds before running.
- Compare against the current baseline or state why no baseline exists.
- Keep spike code isolated and disposable. Never silently promote it to product code.
- Treat invalidation as a successful result.

## 1. Gate the experiment

Inspect the repository, existing behavior, instructions, and available evidence.

Do not build a spike when:

- Documentation or code inspection can answer the question. Research it instead.
- The idea is already validated and the user wants production work. Implement normally.
- The question is too broad to produce an observable result. Narrow it first.

Proceed without ceremony when the task is safe and context is sufficient. Ask before
using production systems, incurring material cost, contacting users, mutating live
state, or accessing sensitive data.

## 2. Frame the decision

Write a compact experiment contract before coding:

1. **Decision:** What decision will this evidence change?
2. **Hypothesis:** Use `Given / When / Then` or `If / Then`.
3. **Riskiest assumption:** Identify one uncertainty across value, usability,
   feasibility, viability, safety, or operability.
4. **Baseline:** Record the current process, incumbent approach, or explicit
   `none - feasibility gate`.
5. **Primary metric:** Choose the measurement that directly answers the hypothesis.
6. **Thresholds:** Pre-register pass, partial, and fail ranges.
7. **Timebox:** Prefer hours or a few days. Stop when it expires.
8. **Decision rule:** Map verdicts to `PROCEED`, `REVISE`, or `STOP`.

Do not use opinions when observable behavior or replay evidence is available. Prefer:

`real behavior > observed task > historical replay > production-shaped simulation > opinion`

When multiple uncertainties exist, rank them by:

`uncertainty x probability of killing the idea x cost of being wrong`

Test the highest-ranked one. Keep other measurements diagnostic, not co-equal goals.

## 3. Allocate fidelity deliberately

Create a fidelity map:

| Surface | Fidelity | Reason |
|---|---|---|
| Input distribution | real or sanitized replay | Inputs determine whether the idea survives reality |
| Risk-bearing API/model/algorithm | real | This is the unknown |
| Output evaluation | real rubric, baseline, or users | A demo is not evidence |
| Auth, admin UI, persistence, polish | fake unless hypothesis-bearing | Does not affect the decision |

Use three fidelity labels:

- **Real:** Actual component or sanitized historical input.
- **Production-like:** Behaviorally equivalent substitute with documented gaps.
- **Fake:** Stub, mock, manual step, or Wizard-of-Oz layer.

Never maximize fidelity everywhere. Spend realism only where a failure could change the
decision. Label every fake and explain why it cannot invalidate the result.

## 4. Build a representative input pack

Freeze inputs before the scored run.

- Preserve the real schema, distribution, and operational constraints.
- Include common cases, difficult-but-common cases, edge cases, and known failures.
- Use enough cases to expose failure modes; do not claim statistical confidence from a
  tiny sample.
- Record provenance, selection logic, strata, and hashes or stable references.
- Separate tuning/development inputs from a holdout set whenever iteration can leak
  answers into the evaluation.
- Store raw secrets, credentials, customer data, and PII outside the repository. Use
  redacted fixtures, approved exports, or pointers in the manifest.

Read [references/experiment-patterns.md](references/experiment-patterns.md) when choosing
a sampling strategy or domain-specific experiment pattern.

## 5. Scaffold the spike

Create a consistent experiment directory:

```bash
python3 "<skill-dir>/scripts/init_slice.py" \
  --root . \
  --name "short descriptive name" \
  --decision "decision this evidence will change" \
  --hypothesis "Given ..., when ..., then ..." \
  --timebox "2 days"
```

Fill the generated contract and manifest. Set `status` to `ready`, then run:

```bash
python3 "<skill-dir>/scripts/check_slice.py" validation-slices/NNN-name
```

Do not start the scored run until the readiness check passes.

## 6. Build the shortest honest vertical slice

Connect:

`representative input -> risk-bearing behavior -> observable output -> evaluation`

Prefer, in order:

1. A runnable CLI accepting a recognizable input.
2. A small endpoint or worker exercising the real integration.
3. A minimal interactive workflow for observed task completion.
4. A focused executable test or notebook for data/model feasibility.

Keep the slice runnable with one documented command. Instrument each case for output,
errors, latency, cost, and the primary metric. Avoid architecture for reuse, generic
frameworks, scale work unrelated to the hypothesis, and visual polish unrelated to task
success.

If two approaches are credible, run them against the same frozen pack. Do not compare
results produced from different inputs.

## 7. Run without moving the goalposts

- Run the baseline and candidate on the same frozen holdout.
- Record environment, dependency/model versions, configuration, command, and timestamp.
- Keep failed, timed-out, null, and rejected cases in the denominator.
- Repeat non-deterministic runs enough to expose variance; fix seeds where appropriate.
- Use blind or rubric-based scoring for subjective outputs when feasible.
- Stop early when a fatal threshold is crossed. Do not rescue the idea by quietly
  changing inputs, prompts, metrics, or thresholds.
- Version any contract change and rerun from a clean holdout.

Write machine-readable per-case evidence to `results/results.jsonl` and the decision
summary to `results/summary.md`.

## 8. Issue the verdict

Use exactly one evidence verdict:

- **VALIDATED:** Pre-registered pass threshold met on the holdout with no fatal safety
  or operability issue.
- **PARTIAL:** Works only under explicit constraints or the evidence remains
  inconclusive.
- **INVALIDATED:** Fail threshold crossed or a fatal blocker found.

Then issue one action:

- **PROCEED:** Plan the real build from the evidence, not from spike code.
- **REVISE:** Change one hypothesis or approach and run a new versioned slice.
- **STOP:** Preserve findings and do not invest further.

Include:

- Decision and confidence.
- Thresholds versus observed results.
- Failure clusters and surprising cases.
- Fidelity gaps and limitations.
- Expected production implications for quality, latency, cost, safety, and operations.
- What evidence would change the decision.

Set `status` to `complete` and run `check_slice.py` again.

## 9. Dispose safely

Keep the contract, input manifest, evidence, and summary. Delete or archive throwaway
code and raw temporary data according to the disposal plan.

Do not copy spike code into production merely because it worked. Reimplementation must
receive normal architecture, testing, security, privacy, reliability, and review.

## Output contract

Produce:

```text
validation-slices/NNN-name/
├── SLICE.md
├── slice.json
├── src/
├── inputs/
│   ├── .gitignore
│   └── manifest.json
└── results/
    ├── results.jsonl
    └── summary.md
```

End the user-facing response with the verdict, action, strongest evidence, largest
remaining uncertainty, and paths to the spike artifacts.
