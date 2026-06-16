# Proposal: Add Spec-Kitty as a Candidate Framework

## Why

Broadening the candidate field (superpowers, compound-engineering, agent-skills,
gsd) makes the benchmark more representative. **Spec-Kitty**
(Priivacy-ai/spec-kitty) is a spec-driven harness with a distinctive model worth
measuring: it runs **"missions"** against an AI host under a **charter** (its
governing constitution), keeping specs, plans, and work packages synchronized
with review evidence via **governed context injection**. That review-evidence
discipline is a different shape from both the agentic (superpowers) and
planning-doc (gsd, compound-engineering) candidates.

Like Spec-Kit, Spec-Kitty integrates as an **external CLI** that drives
slash-commands/actions inside the Claude Code host (`spec-kitty next --agent
claude --mission <slug>`), rather than as a Claude Code plugin — so registering it
further exercises the externally-bootstrapped candidate path.

## What Changes

- Add a **`spec-kitty`** candidate to `config/registry.yaml` (claude-code harness):
  - **Install** (in the trial sandbox): install the pinned `spec-kitty` CLI
    (`v3.1.10`), then initialize a project so the host commands + the
    `.kittify/charter/charter.md` governance scaffolding are written into the
    workspace; assert the pinned version.
  - **Session script** (framework-prescribed wrappers only; the shared base prompt
    remains the sole task content): establish the charter, create a mission from
    `{{BASE_PROMPT}}`, then drive the mission loop (`spec-kitty next …`) to
    completion. The **exact** install command and command/slash-command sequence
    are confirmed against the Spec-Kitty docs during implementation (task 2).
  - **Marker paths** (scrubbed before blind judging): `.kittify/`.
  - **Pin**: `spec-kitty` at `v3.1.10` (deliberate; re-pin to bump).
- Ensure the trial image provides Spec-Kitty's runtime prerequisites (confirmed in
  task 2) so the install is cold-start reproducible.

## Impact

- Affected spec: `candidate-registry` (adds the Spec-Kitty candidate requirement).
- Affected config: `config/registry.yaml` (+ snapshot build deps as needed).
- Fairness preserved: identical rendered base prompt for every candidate; only
  Spec-Kitty's prescribed mission/charter command wrappers are added to its
  session (allowed by the candidate-registry fairness rules).
- No worker/judge or grading changes — graded on the same frozen targets and test
  plans as every other candidate.
