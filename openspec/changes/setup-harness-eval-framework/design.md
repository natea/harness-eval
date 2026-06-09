# Design: Harness Eval Framework

## Context

We want a definitive answer to "which agentic coding framework performs best?" for four candidates, holding harness and model constant:

| Candidate | Source | Install into Claude Code | Invocation protocol |
|---|---|---|---|
| Superpowers 5.1 | github.com/obra/superpowers | `/plugin install superpowers@claude-plugins-official` | No slash commands — plain-language task prompt; skills auto-trigger (brainstorm → plan → worktree → TDD subagent execution) |
| Compound Engineering | github.com/EveryInc/compound-engineering-plugin | `/plugin marketplace add EveryInc/compound-engineering-plugin` + `/plugin install compound-engineering` + `/ce-setup` | Command pipeline: `/ce-plan` → `/ce-work` → `/ce-code-review` (shortcut `/lfg`) |
| Agent Skills | github.com/addyosmani/agent-skills | `/plugin marketplace add addyosmani/agent-skills` + `/plugin install agent-skills@addy-agent-skills` (or skill folders in `.claude/skills/`) | `/spec` → `/plan` → `/build` → `/test` → `/review`, or auto-routed from task prompt |
| GSD (Open GSD) | github.com/open-gsd/gsd-core | `npx @opengsd/gsd-core@latest` (non-interactive flags; pin version) | `/gsd-new-project --auto` → per-phase `/gsd-plan-phase` → `/gsd-execute-phase` → `/gsd-verify-work` |

Provenance note: the original `gsd-build/get-shit-done` repo suffered a governance break (May 2026); we use the maintained `open-gsd/gsd-core` fork and pin an exact npm version.

The eval task is the Symphony Service Specification (`prd/symphony-SPEC.md`, vendored, 2,185 lines, RFC 2119 normative language). Symphony is a headless orchestration daemon (issue-tracker poller + agent runner) — there is no web UI. The spec ships its own §17 Test and Validation Matrix and §18.1 REQUIRED-for-Conformance checklist (18 items), which we use as the objective basis for PRD-adherence grading.

Grading-framework research compared LangChain DeepAgents `RubricMiddleware` (binary pass/fail criteria, no weights, coupled to a LangGraph self-revision loop) and ViBench (vibench.ai, github.com/ViBench/vibench-public, Apache-2.0; PRD-derived human-authored test plans, adaptive LLM evaluator, Pass@1 / Graded Score / Complete Failure Rate, 99% step-level human agreement). Neither covers speed or token spend — those are harness telemetry.

## Goals / Non-Goals

**Goals:**
- Reproducible, isolated, fair runs: identical PRD, prompt, harness (Claude Code), and model (Opus 4.6) across all candidates; only the framework varies.
- A composite scorecard over four weighted dimensions: PRD adherence, code quality, speed of execution, token spend.
- Multiple trials per candidate with variance reporting (single runs of agentic builds are noisy).
- Swap-ready abstractions: a later phase re-runs the same eval with OpenCode and Codex + GPT-5.5 by adding harness adapters, without touching the rubric.

**Non-Goals:**
- Not building a general-purpose benchmark suite (one PRD, four candidates, for now).
- Not evaluating multi-developer/team workflows or long-horizon "compounding" benefits (Compound Engineering's `/ce-compound` learning loop and GSD's cross-session memory are exercised only within the eval run window).
- Not adopting ViBench's repo wholesale (its Playwright/web-app evaluator doesn't fit a daemon target; we borrow its methodology — test-plan-driven adaptive evaluation with partial credit).
- No leaderboard infrastructure; output is a local report.

## Decisions

### D1. Grading methodology: ViBench-style evaluator + DeepAgents-style judge pattern (not RubricMiddleware)

**Decision:** Model PRD-adherence grading on ViBench: a human-authored (here: spec-derived) test plan executed by an adaptive LLM evaluator against the built artifact, yielding step-level partial credit (Graded Score), Pass@1, and Complete Failure Rate. For code quality, use the DeepAgents rubric *pattern* — criterion list scored by a judge model armed with tools (run tests, run linter, read PRD) — implemented standalone.

**To be explicit: neither ViBench's nor DeepAgents' software is ever installed, configured, or invoked in this project.** ViBench here names a *methodology* we replicate, not a dependency. The ViBench-equivalent functionality is built in this repo: the frozen test plan is task 6.1 (`config/testplan.yaml`), and the adaptive evaluator that executes it and emits ViBench's three metrics is task 6.3 (`src/grading/evaluator.ts`). ViBench's actual harness is unusable for this eval on both ends — its generation side is a vendored OpenHands agent (which would replace the very Claude Code + framework combination we are measuring), and its evaluator drives Playwright through a web app's UI (Symphony is a headless daemon with no UI). Likewise, DeepAgents' `RubricMiddleware` is never imported — only its judge-with-tools prompt pattern is reused in task 6.5.

**Rationale:** ViBench's premise matches this eval exactly (same PRD, different construction strategies, one decoupled evaluator) and partial credit can rank four candidates; DeepAgents' binary criteria cannot, and `RubricMiddleware` assumes a LangGraph runtime and an online revision loop we don't want when comparing finished artifacts.

**Alternatives considered:** (a) DeepAgents RubricMiddleware end-to-end — rejected: binary pass/fail, runtime coupling. (b) Pure human review — rejected: not reproducible, doesn't scale across trials. (c) Vendoring ViBench's harness — rejected: generation side is OpenHands-based and its evaluator drives Playwright against web apps; Symphony is a CLI daemon.

### D2. Test plan derived from the PRD's own conformance machinery

**Decision:** The PRD-adherence test plan is authored once, before any runs, from Symphony §17 (test matrix) and §18.1 (18 REQUIRED conformance items), as a versioned YAML checklist of steps with weights. Each step states an observable check (file exists, config parses, daemon behavior under a mock tracker, log fields present). The evaluator agent executes steps inside the candidate's built workspace (run the service against a mock Linear endpoint, inspect logs/filesystem) and records pass / partial / fail with evidence.

**Rationale:** §18.1 is the spec's own Definition of Done — grading against it is the least arbitrary possible operationalization of "adherence to the PRD." Freezing the plan before runs prevents grader drift between candidates.

**Evaluator mechanics (per Replit's automated self-testing design, the lineage of ViBench's evaluator — replit.com/blog/automated-self-testing):** the evaluator agent operates a persistent REPL-style execution context rather than discrete tool calls — it writes and runs code to start/stop the candidate daemon, mutate mock-tracker state, and poll logs/filesystem, with variables and process handles persisting across steps. Evidence for each step verdict comes from observed cause-and-effect (tracker state change → workspace appearance → log fields), not from reading the candidate's source. The evaluator runs as its own agent with only the test plan and the workspace — never the build transcript — mirroring Replit's subagent isolation to avoid context pollution.

### D3. Isolation: Daytona sandboxes primary, git worktrees fallback

**Decision:** Each trial runs in a fresh Daytona sandbox (via Daytona TypeScript SDK, `DAYTONA_API_KEY` from env) provisioned from a pinned snapshot containing Node 18+, Bun, git, and Claude Code CLI with the framework pre-installed. Fallback mode runs trials in local git worktrees under `runs/<run-id>/` with per-trial `CLAUDE_CONFIG_DIR` to isolate plugin installs.

**Rationale:** Daytona gives true environment isolation (frameworks install global state: plugins, `~/.claude/skills`, npm globals) and parallelism without contaminating the host. Worktrees alone do not isolate `~/.claude`, hence `CLAUDE_CONFIG_DIR` per trial in fallback mode. The Daytona CLI is not installed locally; the SDK is the integration point.

**Alternatives:** Docker Compose locally — viable but duplicates what Daytona provides managed; may be added later as a third provider behind the same `SandboxProvider` interface.

### D4. Harness driving: Claude Code headless with scripted session protocol

**Decision:** Drive Claude Code via `claude -p <prompt> --output-format stream-json --model claude-opus-4-6 --dangerously-skip-permissions` inside the sandbox. Each candidate has a *session script*: an ordered list of prompts/commands (e.g., GSD: `/gsd-new-project --auto` then phase loop; Superpowers: single task prompt) with continuation rules (`--resume <session-id>`) and a global wall-clock budget. The final JSON result of each session provides `duration_ms`, `usage` (input/output/cache tokens), `total_cost_usd`, and `num_turns` — the source of truth for speed and token-spend metrics, summed across sessions per trial.

**Rationale:** Headless JSON output gives exact, per-run telemetry without scraping; scripted sessions make multi-command frameworks (CE, GSD) reproducible. `--dangerously-skip-permissions` is acceptable only because trials run in disposable sandboxes.

**Fairness rules:** identical base task prompt template for all candidates ("Build the service defined in SPEC.md to §18.1 conformance; you may use any installed tooling/commands"), framework-specific invocation only where the framework requires named commands; same model, same Claude Code version, same budget caps; the PRD file is mounted identically.

### D5. Scoring model: weighted composite, 0–100

**Decision:** Composite = weighted sum of four normalized dimension scores:

| Dimension | Weight | Source |
|---|---|---|
| PRD adherence | 40% | ViBench-style Graded Score over the frozen test plan (§17/§18.1 derived), step-weighted; Pass@1 and Complete Failure Rate reported alongside |
| Code quality | 25% | LLM judge (tools: test runner, linter, coverage, PRD) over criterion list: tests meaningful & passing, architecture matches §3.2 layering, error handling, no dead code, docs; 3 judge samples, median; plus deterministic signals (type-check passes, lint score) |
| Speed of execution | 17.5% | Total wall-clock per trial (sum of session `duration_ms` + sandbox setup excluded), normalized across candidates (min-max within the run matrix) |
| Token spend | 17.5% | Total tokens and `total_cost_usd` across sessions, normalized likewise |

Per-candidate score = mean across trials, reported with min/max/stddev. Judge model: a fixed non-Opus-4.6 Claude model (avoid self-grading bias), pinned ID, temperature 0.

**Rationale:** Adherence dominates because a fast, cheap, pretty implementation of the wrong thing is worthless. Normalizing speed/cost within the matrix keeps those scores meaningful without absolute targets. Weights are config, not code — adjustable per report consumer.

### D6. Candidate/harness separation for the future OpenCode/Codex phase

**Decision:** A trial is `(framework, harness, model, trial-index)`. Framework definitions declare install + invocation per harness (`claude-code`, later `opencode`, `codex`). The grading pipeline consumes only the built workspace + telemetry records, so it is harness-agnostic by construction.

### D7. Stack

TypeScript on Bun (per stack preferences): orchestrator CLI, Daytona SDK client, telemetry collector, report generator. Judge/evaluator agents invoked via the Anthropic API. Configs in YAML (candidate registry, test plan, weights); run artifacts as JSONL + markdown reports under `runs/`.

## Risks / Trade-offs

- [Agentic variance: one trial per candidate is anecdote, not data] → ≥3 trials per candidate by default; report stddev; composite uses means. Budget guard caps total spend.
- [Cost blow-up: 4 candidates × 3 trials × Opus 4.6 against a 2,200-line spec could run hundreds of dollars] → per-trial token/cost ceilings and wall-clock timeouts enforced by the orchestrator; trials that hit caps are recorded as capped, not silently truncated.
- [Framework non-determinism in invocation (GSD multi-phase, CE approval gates)] → session scripts encode an auto-approval/continuation policy per framework, documented in the candidate registry; deviations logged. Frameworks needing interactive gates get a scripted "proceed" responder.
- [Judge bias / grader drift] → frozen test plan before any runs; pinned judge model + temp 0; 3 samples with median; judges never see which framework produced the artifact (workspace scrubbed of framework markers like `.planning/`, `docs/brainstorms/` before code-quality judging — but PRD-adherence evaluation runs pre-scrub since those dirs don't affect functional checks).
- [Symphony needs a Linear tracker and a Codex app-server to run] → evaluator harness provides a mock Linear API server and a stub app-server binary speaking the JSON-line protocol, per §17's test matrix which anticipates exactly this mocking. A real-Linear bonus tier (§17.8 Real Integration Profile) runs against the dedicated "Symphony Eval Fixtures" project in the Jazkarta workspace (linear.app/jazkarta/project/symphony-eval-fixtures-3f94b77d5df0) with frozen fixture tickets and per-trial state reset; it reports alongside, never inside, the weighted composite.
- [Frameworks update upstream mid-eval] → pin plugin/npm versions and record exact versions in run provenance.
- [Daytona availability/quota] → worktree fallback is a first-class provider, same interface; provider recorded in provenance (results across providers flagged as not directly comparable).
- [Secret handling] → `DAYTONA_API_KEY` and `ANTHROPIC_API_KEY` from env only; never in configs, transcripts are scanned for leaked secrets before archival.

## Open Questions

- Trial count vs. budget: 3 trials × 4 candidates at Opus 4.6 pricing — confirm acceptable spend ceiling before first full run (suggest a single-candidate smoke run first).
- Should Compound Engineering's `/ce-compound` learning step count inside the timed run (it's part of the methodology) or be excluded (it benefits future runs, not this artifact)? Default: included in time/tokens, since the user invokes it as part of the prescribed loop.
- Claude Code version pin: pin to one exact version in the sandbox snapshot (current local: 2.1.170) — confirm before snapshot build.
- Whether the OPTIONAL §13.7 HTTP server is in scope for the test plan (it is RECOMMENDED-only; default: excluded from REQUIRED scoring, reported as bonus signal).
