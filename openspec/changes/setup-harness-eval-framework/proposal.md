# Proposal: Setup Harness Eval Framework

## Why

Agentic coding frameworks (Superpowers, Compound Engineering, Agent Skills, GSD) all claim to improve coding-agent output, but there is no apples-to-apples measurement of which one actually performs best. We need an eval framework that runs each candidate framework against the **same PRD** (the Symphony Service Specification, `prd/symphony-SPEC.md`), with the **same harness and model** (Claude Code + Opus 4.6), in **isolated environments**, and grades results on a definitive rubric: speed of execution, code quality, token spend, and adherence to the PRD.

## What Changes

- Create an eval orchestrator that runs N framework candidates × M trials, each in an isolated environment (Daytona sandbox primary, git worktree fallback), driving Claude Code headless (`claude -p`) with the Opus 4.6 model.
- Define a candidate registry describing how each framework under test is installed and invoked (plugin install commands, slash-command pipelines, multi-session protocols).
- Capture raw run telemetry: wall-clock duration, token usage (input/output/cache), cost, turn count, session transcripts, and the produced workspace.
- Implement a grading pipeline modeled on ViBench (PRD-derived human-authored test plan, adaptive LLM evaluator, Graded Score with partial credit) with two grader classes:
  - **Objective graders** (deterministic): wall-clock duration, token/cost metrics, build success, and the candidate's own test-suite results.
  - **Functional + rubric graders**: a ViBench-style evaluator that executes a test plan derived from the PRD's §17 Test and Validation Matrix and §18.1 conformance checklist against the built artifact (Pass@1, Graded Score, Complete Failure Rate), plus a DeepAgents-style LLM judge armed with tools (test runner, linter, the PRD) for code quality.
- Produce a scorecard report: per-candidate weighted composite score, per-dimension breakdown, and run provenance so results are reproducible and auditable.
- Pin the eval task: build the Symphony service from `prd/symphony-SPEC.md` (vendored at a fixed commit).
- Design for harness swap: candidate definitions separate "framework" from "harness + model" so a later phase can re-run with OpenCode and Codex/GPT-5.5 without rubric changes.

## Capabilities

### New Capabilities

- `eval-orchestration`: Run lifecycle — candidate matrix, trial scheduling, isolation (Daytona sandbox / git worktree), Claude Code headless invocation, timeouts, retries, artifact collection.
- `candidate-registry`: Declarative definitions of frameworks under test (install steps, invocation protocol, session strategy) and of the harness/model pairing.
- `run-telemetry`: Measurement of speed, token spend, cost, and turn counts from Claude Code session output; transcript and workspace archival.
- `grading-rubric`: The scoring model — objective graders (conformance checklist, test matrix execution) and LLM-judge rubric graders (code quality, PRD adherence), weights, scales, and judge protocol.
- `eval-reporting`: Scorecard generation — composite ranking, per-dimension scores, statistical handling of multi-trial variance, provenance metadata.

### Modified Capabilities

_None — greenfield project._

## Impact

- New codebase in this repository (TypeScript/Bun per stack preferences).
- External dependencies: Daytona SDK (API key via `DAYTONA_API_KEY` env var — never committed), Claude Code CLI ≥ 2.x in headless mode, Anthropic API for the judge model.
- Vendored PRD: `prd/symphony-SPEC.md` (openai/symphony SPEC.md, pinned).
- Candidate frameworks installed only inside isolated environments, never into this repo's own `.claude/` config.
- Cost exposure: 4 candidates × multiple trials × Opus 4.6 building a ~2,200-line spec is a materially expensive eval; budget controls are part of orchestration requirements.
