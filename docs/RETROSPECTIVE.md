# Harness-Eval Retrospective

_Covers work from project inception (2026-06-09) through the in-flight 3-candidate cloud run (2026-06-10). Written while `superpowers`/`compound-engineering`/`agent-skills` n=1 trials execute in the cloud._

## 1. Goal

Definitively rank four agentic coding frameworks — **Superpowers**, **Compound Engineering**, **Agent Skills**, **GSD** — by having each build the same product (the [Symphony Service Specification](../prd/symphony-SPEC.md), an issue-tracker-driven orchestration daemon from openai/symphony) with the same harness and model (**Claude Code + Opus 4.6**), graded on a weighted rubric: PRD adherence (40%), code quality (25%), speed (17.5%), token spend (17.5%). A later phase swaps the harness (OpenCode, Codex + GPT-5.5) without changing the rubric.

## 2. What was built

Spec-first via OpenSpec (change `setup-harness-eval-framework`: proposal, design, 5 capability specs, 35 tasks), then a TypeScript/Bun implementation:

| Layer | Components |
|---|---|
| Candidate registry | `config/registry.yaml` — per-framework install commands (dry-test-verified), session scripts, content-free continuation allowlists, marker paths for blind judging; fail-fast zod validation |
| Isolation | `SandboxProvider` interface; Daytona provider (pinned snapshot `harness-eval-base:v2`, auto-stop disabled) and git-worktree fallback with per-trial `HOME`/`CLAUDE_CONFIG_DIR`; contamination tests |
| Harness driver | Headless Claude Code (`claude -p`, stream-json), session-script executor with approval-gate continuations, wall-clock/cost caps (`capped` status), telemetry aggregation (agent time vs setup time), secret-redacting archival |
| Orchestrator | Matrix scheduler (candidates × trials, bounded concurrency, interleaved), infra-retry vs candidate-failure classification, run budget ceiling, provenance at every terminal state |
| Grading | Frozen test plan (`config/testplan.yaml`, 22 steps / 57 pts, programmatic §18.1 coverage check, fatal cold-start gates); mock Linear GraphQL server + stub Codex app-server; adaptive evaluator (no-repair rule, evidence-based verdicts, per-step checkpointing); blind code-quality judge (5 criteria × 3 samples, median); min-max normalization; re-weightable composite |
| Reporting | `results.json` (stable schema keyed by candidate/harness/model) + markdown scorecard with variance stats and inconclusive-ordering flags |
| Real-integration tier (bonus, not yet run) | 6 frozen fixture issues in Linear (Jazkarta "Symphony Eval Fixtures", JAZ-5…10, incl. a deliberately blocked issue), manifest hash integrity check, baseline reset |
| Cloud mode | Orchestrator-in-a-sandbox (`infra/run-all-cloud.sh`): laptop-free runs, monitored from the Daytona dashboard |

## 3. Key decisions

- **ViBench methodology, not ViBench software.** ViBench (Replit/Georgian/CMU, CAIS 2026) matched the premise exactly — same PRD, different construction strategies, one decoupled evaluator, partial-credit Graded Score — but its harness is OpenHands+Playwright for web apps; Symphony is a headless daemon. We replicated the method: spec-derived frozen test plan, fatal/non-fatal sequential steps, adaptive REPL evaluator, Pass@1 / Graded Score / Complete Failure Rate. DeepAgents' `RubricMiddleware` was rejected (binary pass/fail, LangGraph-coupled) but its judge-with-tools pattern survives in the code-quality judge.
- **Grade against the spec's own Definition of Done.** Symphony §18.1 (18 REQUIRED items) + §17 test matrix → least-arbitrary operationalization of "adherence to the PRD." Every REQUIRED item maps to ≥1 test-plan step, validated programmatically.
- **Don't impose a shared planning workflow.** Each framework plans its own way (GSD `.planning/`, CE `/ce-plan`, Superpowers brainstorming). Forcing PRD→Linear decomposition on all of them would grade our workflow, not theirs. Outcomes are graded, not planning style.
- **Stub the coding agent.** Symphony orchestrates *Codex* workers (§10 targets the Codex app-server protocol). Grading uses a protocol-speaking stub — endorsed by the spec's own §17 — so no OpenAI account is needed and agent variance is excluded from the measurement.
- **Blind judging.** Code-quality judging runs on a scrubbed copy (all registered framework markers removed from every artifact, so absence isn't a signal). 3 samples, median; judge model ≠ worker model.
- **Two grading drivers** (branch `cc-subscription-grading`): `sdk` (Anthropic SDK loops, temp 0, API-key-billed) and `cc` (graders hosted on headless Claude Code, Max-subscription-billed). The CC driver exists because api.anthropic.com rejects subscription OAuth; only Claude Code accepts it. Deviations (no temp pinning, Claude Code's own tools) are recorded in `grades.json`.

## 4. Defect log — what the smoke run flushed out

The single GSD smoke trial surfaced ten real defects across every layer of the stack. This list is the strongest argument for smoke-before-matrix:

| # | Defect | Layer | Fix |
|---|---|---|---|
| 1 | Snapshot user uid 1001 vs Daytona toolbox daemon uid 1000 → workspace upload `permission denied` | Daytona image | Snapshot v2 uses base image's `ubuntu` (uid 1000) |
| 2 | `env K=V cmd1 \| cmd2` applied env only to `cmd1` → "Not logged in" despite valid token | Provider exec | Exports wrapped in `bash -lc` |
| 3 | Agent-spawned daemons inherited claude's stdout pipe → exec stream never closed → orchestrator hung | Harness driver | Session output redirected to file, read back separately |
| 4 | `< /dev/null` added with the file redirect clobbered the prompt pipe → instant session failure | Harness driver | Removed; prompt flows via stdin again |
| 5 | `tsc`/`bun test` crawled archived artifact workspaces under `runs/` → false failures | Repo config | tsconfig `include` scoped; `bun test tests` |
| 6 | Stub app-server answered only the first handshake message → conforming multi-stage clients (`client/init`→`thread/create`) timed out, unfairly failing P-1/A-1 | Grading fixture | Stub ACKs every id-bearing non-turn request |
| 7 | Evaluator iteration budget (120) exhausted with 11/20 steps unrecorded | Grading | Budget → 400; unrecorded-step evidence made explicit |
| 8 | API billing failure mid-grade lost all completed verdicts | Grading | Per-step evaluator checkpointing + per-criterion judge checkpointing; `--fresh` for deliberate re-grades |
| 9 | `claude plugin install --version` doesn't exist; GitHub-source plugins clone over ssh (no keys in sandbox) | Registry | Dry-test-verified install commands; post-install version assert (fail on mismatch); global ssh→https rewrite |
| 10 | Orchestrator (4GiB) + 2×4GiB trials > 10GiB org tier → instant `infra-failed` | Cloud mode | Cloud concurrency 1; tier upgrade documented as the lever for parallelism |

Also notable: Daytona sandboxes auto-stop after 15 idle minutes by default — fine for trial sandboxes kept alive by exec activity, fatal for a detached orchestrator. Both now run with auto-stop disabled.

## 5. Results so far — GSD smoke trial (n=1)

Build telemetry (Opus 4.6, Max subscription): **25.2 min agent time, 124 turns, 4 sessions, $10.97-equivalent, ~10.5M cache-read tokens.** GSD front-loaded essentially the whole build into its first session (`/gsd-new-project --auto`), including a self-run §18.1 conformance audit; the later phase commands added little. 13 source files, TypeScript, 97 self-reported passing tests.

Grading (CC driver, claude-sonnet-4-6):

| Dimension | Score | Detail |
|---|---|---|
| PRD adherence | **78.25 / 100** | No Pass@1; no complete failure. Clean sweep of workflow/config machinery (cold-start gates, path precedence, typed errors, `$VAR` resolution, hot-reload with last-known-good). Worst miss: **R-3 reconciliation 0.1** (didn't stop runs on mid-run tracker state change). Bonus steps (optional HTTP server/snapshot surface): not implemented, 0 |
| Code quality | **60 / 100** | tests 5 (real but shallow), architecture 8 (§3.2-faithful layering), errorHandling 8, deadCode 7, **documentation 2** (essentially no operator docs) |
| Composite | **81.3** | Speed/spend normalize degenerately at n=1 single candidate; meaningful only once the matrix lands |

Judge sample agreement was tight (worst spread 5,7,7) — early evidence the median-of-3 protocol is stable.

## 6. Costs and resource notes

- **Builds:** ~$11-equivalent per GSD-sized trial on the Max subscription (no API dollars). Watch 5-hour rate-limit windows when running matrices.
- **Grading:** SDK driver burned real API credits fast (~$15–25/trial extrapolated — twice exhausted a small balance mid-run, motivating checkpointing and then the CC driver). CC driver: $0 API, subscription-billed.
- **Daytona:** free-tier 10GiB memory cap is the concurrency bottleneck; snapshot storage and sandbox-hours otherwise unremarkable.

## 7. Process lessons

1. **Smoke runs earn their keep.** Ten defects found at n=1 cost one trial; the same defects discovered inside a 12-trial matrix would have invalidated hours of spend.
2. **Checkpoint everything that costs money.** Verdict-level and criterion-level checkpoints turned two billing outages from total losses into resumable pauses.
3. **Fixture fairness is a real workload.** The stub app-server has to impersonate Codex well enough that protocol-conforming artifacts aren't falsely penalized (§10 is "implementation-defined," so candidates legitimately vary). P-1/A-1 verdicts retain some impersonation uncertainty even after the fix — flagged for review before the full matrix.
4. **Subscription vs API auth is an architecture constraint, not a config detail.** OAuth tokens work only through Claude Code; SDK agents need funded API accounts. Decide the billing path before building graders.
5. **Pin what you can, assert what you can't.** The plugin CLI offers no version selection; post-install version assertions (fail-on-mismatch) preserve the spec's pinning intent.
6. **Evaluators want to fix things.** The no-repair rule (from ViBench's "overeager evaluator" misalignment finding) plus evidence-citation requirements kept verdicts honest in practice.
7. **Verify auth end-to-end early.** Three separate auth failures (keychain OAuth not portable, mislabeled env var, empty credit balance) each cost a launch cycle; a 1-token probe before any expensive step is now standard practice in the harness.

## 8. Current state and open work

- **Complete:** 34/35 OpenSpec tasks. GSD graded end-to-end. Cloud orchestrator operational.
- **In flight:** `superpowers`, `compound-engineering`, `agent-skills` × n=1, building sequentially in the cloud orchestrator (laptop-independent), each to be CC-graded and folded into a combined 4-candidate scorecard.
- **Open (task 8.4 and beyond):**
  - Full 3-trials-per-candidate matrix (operator-gated; consider Daytona tier upgrade for concurrency 3+)
  - First-session protocol review for CE/Agent Skills slash-command scripts (first live exercise happening now)
  - Stub-protocol fidelity review for A-1/P-1 fairness before the matrix
  - Real-integration bonus tier (Linear fixtures JAZ-5…10) — built, not yet run
  - SDK-vs-CC grader comparison on the same artifact (branch exists for exactly this)
  - Phase 2: OpenCode and Codex + GPT-5.5 harness adapters (registry sections, no rubric changes)
