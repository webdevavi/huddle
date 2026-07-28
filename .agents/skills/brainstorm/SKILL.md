---
name: brainstorm
description: |
  Parallel brainstorming workflow. Use when the user invokes /brainstorm,
  asks to brainstorm, ideate, explore options, pressure-test an idea, generate
  alternatives, or collaborate with multiple subagents on the current context.
  In a new chat, support prompts like "/brainstorm your context here" where the text
  after the keyword is the brainstorming brief. The skill should spawn 3
  parallel subagents by default, use a compact context packet for long sessions,
  collect independent perspectives, and synthesize the strongest ideas with
  tradeoffs and next steps.
---

# Brainstorm

## Goal

Use parallel subagents to explore an idea from several independent angles, then
collaborate with the user on a concise synthesis. This is for discovery and
decision support, not for outsourcing the final answer wholesale.

## Step 1: Establish The Brief

Use the current conversation, active files, plan, or artifact as context when the
user types `/brainstorm` without extra text.

When the conversation is short (roughly under 15 turns) and focused, the brief
may use the full relevant conversation context.

When the conversation is longer, do not fork the full context by default.
Extract a compact context packet instead:

- One sentence naming the problem and decision at stake.
- Two to four bullets of hard constraints or non-negotiables already established.
- Options, framings, or approaches already ruled out.
- Relevant artifacts or files by name, not pasted in full.

Target under 300 tokens. If implementation details are necessary, include only
the minimal excerpt needed to reason about the relevant function, interface, or
contract. Keep excerpts under 100 tokens whenever possible.

If the chat has little or no usable context, treat any text after `/brainstorm`
as the brief. If there is still no brief, ask one short question:

> What should we brainstorm?

Do not ask for more detail unless a reasonable brainstorm would be impossible
or risky without it. Do not ask about scope, timeline, and format in the same
turn. Make pragmatic assumptions and state them in the synthesis.

## Step 2: Choose 3 Lenses By Default

Spawn 3 subagents in parallel by default. Use 4 only when the problem has a
clearly separable fourth lens that would otherwise crowd another lens, such as a
decision with both deep technical and deep market, legal, or regulatory
dimensions.

Do not add a fourth agent merely to "cover more ground." The marginal cost is
not only latency; it is synthesis complexity and overlapping output.

Choose distinct lenses that fit the brief. Common lenses:

- User/customer value
- Product strategy
- Engineering feasibility
- Design/UX
- Go-to-market or distribution
- Risk, failure modes, and edge cases
- Contrarian alternatives
- Execution plan and sequencing

Avoid sending every subagent the same generic prompt. Each subagent should have
a specific role, a concrete output format, and permission to challenge premises.

## Step 3: Spawn Parallel Subagents

Use the available multi-agent tool to spawn all subagents in the same round.
Use `fork_context: true` only when the conversation is short, focused, and the
full context is likely cheaper and safer than reconstructing it. For long chats,
repo-heavy sessions, or sessions near compaction, pass the compact context packet
explicitly instead of forking the full context.

Use `agent_type: "explorer"` for research, critique, and option discovery.
Use `agent_type: "worker"` only if the brainstorm requires concrete artifact
creation or code changes with a clear, disjoint write scope.

Do not override model, reasoning effort, or service tier unless the user
explicitly asks or the task has a clear need.

Prompt pattern:

```text
We are brainstorming: <compact brief or short full brief>

Your lens: <specific lens>.

Ignore concerns outside this lens even if they seem important. The main agent
will synthesize across lenses.

First, write 2-3 sentences on what would have to be true for the conventional
wisdom from this lens to be wrong.

Return:
1. Exactly 2-4 concrete findings from this lens.
2. One named assumption your analysis depends on.
3. One specific risk with a named mechanism.
4. A recommendation for what the main agent should do next.

Be concrete. Do not solve the whole problem generically; focus on your lens.
Keep the response under 350 tokens.
```

## Step 4: Work While They Run

While subagents run, do useful non-overlapping work:

- Clarify the brief into one or two sentences.
- Identify the single most important constraint the synthesis must honor.
- Sketch evaluation criteria for judging ideas.
- Sketch what a genuinely good outcome would look like, as distinct from a
  merely complete answer.
- Note any context withheld from the compact packet that may matter later.
- If relevant, inspect local files that are already part of the context.

Do not duplicate the exact tasks delegated to subagents. Do not begin drafting
the synthesis until the subagents return.

## Step 5: Synthesize

After the subagents complete, compare their outputs. Do not paste raw transcripts
unless the user asks.

Produce a synthesis in this order:

- Central question: one sentence.
- Agreement: one sentence on what the agents converged on. If nothing, say so.
- Findings: 2-4 findings ranked by leverage. Write each as
  "finding - why it matters more than it seems."
- Named tension: one incompatible pair of conclusions, plus the empirical fact
  or value judgment that would resolve it.
- Sharp risk: the risk that most damages the recommended direction if wrong,
  with the mechanism named.
- Recommended direction: one specific next move, not a theme.
- Next steps: 2-5 concrete actions.
- One open question for the user, tied to the named tension or sharp risk.

Do not open with a summary of what each agent said. Do not organize the synthesis
by agent name or lens label. Call out assumptions and real disagreements. If one
agent produced weak or generic output, discount it rather than forcing parity;
mention that only if it affects confidence in the recommendation.

## Step 6: Collaborate

End with a focused prompt that helps the user continue:

- If there are multiple viable directions: ask which direction to deepen.
- If one direction is clearly strongest: propose the next concrete step.
- If the brief is still under-specified: ask for the single missing input that
  would most improve the brainstorm.

Keep the user-facing answer compact. The value of this skill is independent
thinking plus synthesis, not volume.

## Long Chat And Repo Context

When the current conversation is a long working session with plans, files, prior
decisions, or repo context loaded, treat the conversation itself as an artifact.
Do not summarize the whole session for the brief. Identify the specific decision
the brainstorm is serving now and extract only context that bears on that
decision.

When repo or file context is present, avoid pasting code into subagent prompts.
Name the file and describe the constraint it imposes in one sentence. Include a
small excerpt only when the subagent needs implementation-specific reasoning.

When the conversation is approaching context limits, declare the compact packet
before spawning:

```text
This conversation is getting long. I am extracting a compact brief rather than
forking full context. I am including: <packet>. Anything important missing?
```

Use this confirmation only when the risk of context loss is material. Otherwise
proceed with the packet and state any assumptions in the synthesis.

## Compaction

A brainstorm session is full when three or more synthesis rounds have completed,
the recommended directions are converging without new tension, or the user's
follow-up questions are narrowing rather than opening the space.

At that point, before the conversation grows further, emit a compact continuation
block:

- Settled conclusions: decisions effectively made.
- Still open: the real remaining uncertainty.
- Next action: the single most important next move.

Label it as a compaction block so future turns can use it as the context packet.

## Important Rules

1. `/brainstorm` means parallel subagents by default.
2. Use existing context first; use text after `/brainstorm` as the brief in new
   chats.
3. Prefer a compact context packet over full-context forking in long sessions.
4. Spawn 3 subagents by default; use 4 only for a truly separable fourth lens.
5. Keep delegated prompts self-contained, lens-locked, and concrete.
6. Synthesize, rank, and challenge. Do not merely concatenate outputs.
7. Do not make file edits unless the user asks for an artifact or implementation.
