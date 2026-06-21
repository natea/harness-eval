# Proposal: Add Spec-Kit as a Candidate Framework

## Why

The candidate set (superpowers, compound-engineering, agent-skills, gsd) is the
heart of the benchmark — the more representative the field, the more useful the
ranking. **Spec-Kit** (GitHub's open spec-driven development toolkit) is a
prominent, distinct methodology worth measuring: it drives a build through an
explicit **constitution → specify → plan → tasks → implement** workflow rather
than free-form agentic coding. Adding it lets the harness compare spec-driven
development head-to-head with the existing agentic and planning frameworks on the
same frozen targets.

Spec-Kit also exercises a **different integration shape** than our current
candidates: instead of a Claude Code plugin (`claude plugin install …` + a
version assert), it installs an external CLI (`specify`) that **bootstraps
project-local slash commands** into the workspace. Registering it confirms the
candidate-registry handles externally-bootstrapped, slash-command frameworks, not
just plugins.

## What Changes

- Add a **`spec-kit`** candidate to `config/registry.yaml` with the `claude-code`
  harness:
  - **Install** (in the trial sandbox): `uv tool install specify-cli --from
    git+https://github.com/github/spec-kit.git@v0.10.2`, then
    `specify init . --ai claude --force` to generate the `/speckit.*` commands and
    `.specify/` scaffolding into the workspace; assert the pinned CLI version.
  - **Session script** (the only framework-prescribed wrappers; the shared base
    prompt is still the sole task content): `/speckit.constitution`,
    `/speckit.specify {{BASE_PROMPT}}`, `/speckit.plan`, `/speckit.tasks`,
    `/speckit.implement`.
  - **Marker paths** (scrubbed before blind judging): `.specify/`, `specs/`.
  - **Pin**: `specify-cli` at `v0.10.2` (deliberate, re-pin to bump).
- Ensure the trial image can run it: **Python 3.11+, `uv`, and git** available in
  the sandbox snapshot (a build-deps task).

## Impact

- Affected spec: `candidate-registry` (adds the Spec-Kit candidate requirement).
- Affected config: `config/registry.yaml` (+ snapshot build deps for `uv`/Python).
- Fairness preserved: every candidate still receives the identical rendered base
  prompt; only Spec-Kit's prescribed `/speckit.*` command wrappers are added to
  its session script (allowed by the candidate-registry fairness rules).
- No worker/judge or grading changes — Spec-Kit is graded on the same frozen
  targets and test plans as every other candidate.
