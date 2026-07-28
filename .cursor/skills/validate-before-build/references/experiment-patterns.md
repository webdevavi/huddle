# Experiment Patterns

Read the relevant section when choosing the experiment design or input strategy.

## Contents

1. Evidence design
2. Representative inputs
3. AI and probabilistic systems
4. APIs and integrations
5. Data pipelines and migrations
6. User workflows
7. Performance and scale
8. High-stakes domains
9. Anti-patterns

## 1. Evidence design

Match the experiment to the risk:

| Risk | Strongest economical evidence |
|---|---|
| Technical feasibility | Executable spike using the real risk-bearing dependency |
| Output quality | Frozen labeled replay set plus baseline comparison |
| User task success | Functional task slice observed with target users |
| Demand or willingness to pay | Real commitment, purchase, or costly behavior |
| Operational viability | Production-shaped load, failure injection, and cost measurement |
| Data availability | Schema/profile audit plus representative replay |
| Workflow adoption | Concierge or Wizard-of-Oz workflow measuring completed behavior |

Do not use a polished interface to answer a feasibility question or a technical demo to
answer a demand question.

## 2. Representative inputs

Define the target population before sampling. Preserve the dimensions that can change
the result, such as:

- Source, customer segment, language, file type, device, geography, or channel.
- Size, complexity, age, sparsity, noise, and missingness.
- Known failure class, policy category, or operational state.
- Peak versus typical volume.

Build strata from observed production frequencies, then deliberately add rare but
consequential cases. A useful small-pack shape is:

- Common cases reflecting normal frequency.
- Difficult-but-common cases that dominate support or manual effort.
- Boundary and malformed cases.
- Previously observed failures.
- A holdout not used for tuning.

Keep a stable case ID, source reference, stratum, selection reason, and content hash.
Do not put sensitive content in the manifest.

Use synthetic data only when real data is unavailable or unsafe. Validate that its
schema, distributions, correlations, and failure modes resemble reality. Label every
synthetic case.

## 3. AI and probabilistic systems

- Freeze model identifier, prompt, tool definitions, temperature, and retrieval corpus.
- Compare against the incumbent model, prompt, or human process.
- Use labeled historical cases and a separate holdout.
- Define the evaluation rubric before viewing candidate outputs.
- Blind the evaluator to variant identity where possible.
- Repeat calls to measure variance and tail failures.
- Report task success, unacceptable-error rate, latency, token usage, and cost.
- Treat safety, policy, hallucination, or data-leak failures as potential fatal gates.
- Inspect failure clusters; an acceptable mean can hide an unacceptable subgroup.

Do not tune prompts on the scored holdout and then report the same score.

## 4. APIs and integrations

- Use the real sandbox or API when its behavior is the uncertainty.
- Exercise authentication, pagination, rate limits, timeouts, malformed responses,
  retries, idempotency, and schema drift.
- Record request counts, latency distributions, error categories, and monetary cost.
- Verify terms, quotas, and data-handling constraints before concluding viability.
- Use read-only calls or isolated test tenants unless live mutation is explicitly
  authorized.

Mock only the side of the boundary already understood.

## 5. Data pipelines and migrations

- Replay an approved, production-shaped snapshot.
- Preserve skew, duplicates, nulls, ordering, late arrivals, and large records.
- Define invariants such as row counts, checksums, referential integrity, and business
  totals before execution.
- Compare source and destination using automated reconciliation.
- Measure throughput, memory, storage, retry behavior, and recovery from interruption.
- Test rollback or restart semantics when they are part of the risk.

Never treat a clean toy dataset as migration evidence.

## 6. User workflows

- Recruit users matching the target role and context.
- Give them a goal, not step-by-step instructions.
- Measure completion, time, errors, abandonment, assistance, and consequential choices.
- Use a functional core with manual or fake back-office steps when those steps are not
  under test.
- Distinguish comprehension, usability, demand, and willingness to pay. They require
  different evidence.
- Prefer observed behavior over "Would you use this?" responses.

Obtain appropriate consent and avoid deception that could cause harm or financial loss.

## 7. Performance and scale

- Shape request size, concurrency, burstiness, and cache state like the real workload.
- Measure warm and cold paths separately.
- Report distributions such as p50, p95, and p99 rather than averages alone.
- Include dependency quotas, resource consumption, and unit economics.
- Run long enough to reveal leaks, backlogs, retries, and degradation.
- Distinguish a feasibility spike from a capacity guarantee.

## 8. High-stakes domains

For medical, legal, financial, safety-critical, security-sensitive, or regulated work:

- Use the spike only as preliminary evidence.
- Require domain review, privacy controls, threat analysis, and applicable validation.
- Do not expose real people to unvalidated decisions.
- Do not infer deployment safety from a small replay set.
- Treat irreversible harm and compliance failure as fatal gates.

## 9. Anti-patterns

- **Happy-path theater:** One curated example succeeds.
- **Synthetic comfort:** Fake inputs omit the mess that determines feasibility.
- **Moving thresholds:** Success is redefined after results appear.
- **Leaky evaluation:** The holdout becomes prompt-development data.
- **Wrong evidence:** Opinions substitute for behavior or a demo substitutes for demand.
- **Average blindness:** A good mean hides catastrophic tails or subgroup failures.
- **Overbuilding:** Auth, polish, deployment, and abstractions consume the timebox.
- **Prototype inheritance:** Throwaway code becomes a production foundation by inertia.
- **Endless rescue:** The experiment continues after the pre-registered stop condition.
