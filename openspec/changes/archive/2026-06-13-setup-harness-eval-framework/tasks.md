# Tasks: Setup Harness Eval Framework

## 1. Project Scaffolding

- [x] 1.1 Initialize Bun + TypeScript project (`bun init`), lint/format config, `runs/` and `config/` directories, `.gitignore` for `runs/` artifacts and env files
- [x] 1.2 Pin and vendor the PRD: record content hash of `prd/symphony-SPEC.md` and the upstream commit it was fetched from
- [x] 1.3 Define shared types/schemas (zod): trial, provenance record, telemetry record, registry entry, test plan, grading record, report JSON

## 2. Candidate Registry

- [x] 2.1 Implement registry loader with schema validation (fail-fast on missing pinned version or missing harness section)
- [x] 2.2 Author registry entries for the four candidates with pinned versions: Superpowers (plugin), Compound Engineering (plugin + `/ce-setup`), Agent Skills (plugin), GSD (`npx @opengsd/gsd-core@<pinned>` non-interactive)
- [x] 2.3 Author the shared base task prompt template (PRD location, §18.1 conformance target, completion criteria) and per-candidate session scripts with content-free continuation allowlist
- [x] 2.4 Record framework marker paths per candidate (e.g., `.planning/`, `docs/brainstorms/`) for later scrubbing

## 3. Isolation Providers

- [x] 3.1 Define `SandboxProvider` interface (provision, exec, copyOut, destroy)
- [x] 3.2 Implement Daytona provider using the Daytona TypeScript SDK (`DAYTONA_API_KEY` from env); build and pin the snapshot image (Node 18+, Bun, git, pinned Claude Code version)
- [x] 3.3 Implement git-worktree fallback provider with per-trial `CLAUDE_CONFIG_DIR`
- [x] 3.4 Verify cross-trial contamination scenarios (plugins/skills/npm globals invisible across concurrent trials)

## 4. Harness Driver

- [x] 4.1 Implement Claude Code headless driver: `claude -p --output-format stream-json --model claude-opus-4-6 --dangerously-skip-permissions`, session resume support, stream capture
- [x] 4.2 Implement session-script executor (ordered prompts, continuation policy, per-trial wall-clock and cost caps with `capped` status)
- [x] 4.3 Implement telemetry extraction from result JSON (duration, token breakdown, cost, turns) with per-session records and per-trial aggregation
- [x] 4.4 Implement artifact archival (workspace + transcripts) before sandbox teardown, with secret-pattern redaction

## 5. Orchestrator

- [x] 5.1 Implement run matrix scheduler (candidates × trials, bounded concurrency, subset/smoke-run support)
- [x] 5.2 Implement infra-failure retry vs. candidate-failure no-retry classification
- [x] 5.3 Implement run-level budget ceiling with `skipped:budget` handling
- [x] 5.4 Write provenance records at every trial terminal state

## 6. Grading Pipeline

- [x] 6.1 Author the frozen PRD-adherence test plan YAML from Symphony §17 and §18.1 (every REQUIRED item mapped to ≥1 weighted step; OPTIONAL items as non-scoring bonus); validate coverage programmatically
- [x] 6.2 Build the evaluation fixtures: mock Linear tracker API server and stub app-server binary speaking the JSON-line protocol (per §17 test matrix)
- [x] 6.3 Implement the adaptive functional evaluator agent (runs service against mocks, executes test-plan steps, records pass/partial/fail with evidence) producing Graded Score, Pass@1, Complete Failure Rate
- [x] 6.4 Implement workspace scrubbing of framework markers for blind judging
- [x] 6.5 Implement code-quality judge (pinned non-Opus-4.6 model, temp 0, tools: test runner/linter/type-checker/coverage/PRD; 3 samples, median; criterion scores with evidence)
- [x] 6.6 Implement objective scoring: speed and token-spend normalization across candidate means, capped-trial flagging
- [x] 6.7 Implement weighted composite scoring with config-driven weights (40/25/17.5/17.5 defaults), re-weightable from stored scores
- [x] 6.8 Author the frozen fixture issue set (5–8 tiny deterministic coding tasks with mechanically checkable outcomes) in the "Symphony Eval Fixtures" Linear project (Jazkarta workspace, JAZ team) and record the fixture manifest hash
- [x] 6.9 Implement the real-integration bonus tier: fixture state reset to baseline, scoped Linear credentials for the candidate service, per-fixture outcome recording, manifest integrity check

## 7. Reporting

- [x] 7.1 Implement JSON results emitter (stable schema keyed by candidate/harness/model)
- [x] 7.2 Implement markdown scorecard generator (ranking, dimension breakdowns, variance stats with inconclusive-ordering flags, provenance section, exclusions)

## 8. Validation and First Run

- [x] 8.1 Unit tests for registry validation, telemetry aggregation, normalization math, composite scoring, redaction
- [x] 8.2 End-to-end dry run: one candidate, worktree provider, tiny stand-in PRD, assert full artifact/report chain
- [x] 8.3 Single-candidate smoke run against the real Symphony PRD (confirm spend ceiling with operator first)
- [ ] 8.4 Full 4-candidate × 3-trial run on Daytona; generate scorecard
- [x] 8.5 Review Open Questions from design.md with operator (trial count/budget, `/ce-compound` inclusion, Claude Code version pin, §13.7 scope) and record decisions in the run config
