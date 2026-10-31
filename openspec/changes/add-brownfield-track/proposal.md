# Add: Brownfield Track (issue-replay evaluation on real repositories)

## Why

Every current target is greenfield: a frozen PRD, an empty workspace, and a test
plan. That measures how well a harness *builds* something new, but most real agent
work is **brownfield** — fixing an issue in an existing codebase the agent didn't
write. Harnesses may rank differently there (repo navigation, reading conventions,
running an existing test suite, resisting distracting hints).

Merged PRs that close issues are natural brownfield tasks with built-in ground
truth: the issue is the task, the repo at the PR's base commit is the starting
state, and the PR's tests are the oracle. SWE-bench, SWE-rebench and SWE-bench-Live
established the pattern; this change adapts it to harness-eval's goal (comparing
*harnesses*, holding the model fixed) and adds what those projects lack: issue
**time-travel** (the issue as it read *before* any fix work), sealed workspaces,
and leak-graded discussion as an experimental variable.

A spike on `Future-House/paper-qa` (2026-10-31; artifacts in
`brownfield/paper-qa/`, gitignored) validated the approach end to end:

- 36 merged PRs close issues; after filters roughly 20 are candidates.
- The cutoff T* came from the **first PR commit** in 37/37 issues — commits
  predate PR creation, so "PR opened" would have leaked in-progress discussion.
- Issue-body edit history (GraphQL `userContentEdits`) stores full text (5/5
  verified); paper-qa never rewrote issues after T*, but the mechanism is kept.
- 2 issues were opened *after* fix work began (fixer's note-to-self) → excluded.
- FAIL_TO_PASS validation works offline at historical commits (e.g. #1311: one
  test flips fail→pass, one live-API test is env-broken both ways and excluded).
- A gold-aware LLM leak classifier ($0.79 for 37 issues) found discussion changes
  the task in ~15/37 issues (root-cause diagnoses, fix sketches, even exact fix
  code from the future fixer) and that 36% of kept comments are from an AI bot
  (`dosubot`) whose guesses are usually inconsistent with the real fix.

## What Changes

- **New capability `brownfield-tasks`:** mine merged PR ↔ issue pairs from a
  repository; compute T*; reconstruct the issue at T* (title, body, labels,
  comments, edit history; bots tagged); rebuild a history-sanitized repo at the
  base commit; build an offline test environment; validate FAIL_TO_PASS /
  PASS_TO_PASS with repeated gold runs; classify leakage in body and comments;
  record a human baseline (coding window, review time, review rounds, issue
  lifetime, diff size); reject PRs that change dependencies (`dependency-change`,
  not installable offline from the base lockfile); and freeze each task as a
  hashed **task bundle**.
- **Three prompt variants as a run parameter:** `body`, `body+human`,
  `body+all` (humans + bots). Identical across candidates within a run.
- **Orchestration:** a brownfield trial kind that seeds the sealed repo instead of
  an empty workspace, renders a brownfield base prompt (generic anti-cheat clause,
  no PR number), blocks network egress except to a run-owned **model gateway**,
  and disables server-side web tools for every candidate. The gateway (outside the
  sandbox) injects credentials (an API key by default) so workers never hold a
  real key, forwards only to the run's model, and rejects requests that enable
  provider-side tools. Harnesses reach it through a same-protocol endpoint
  override. Claude Code model slots are pinned to the run's model, and a
  one-request probe per candidate runs before any spend. The application's own
  network traffic (e.g. paper-qa's LLM calls) is recorded-fixtures-only by
  default, with a per-task `appEgress` allowlist as the opt-in.
- **Trial isolation (all trials):** every trial starts from a fresh home and
  config, with no operator MCP servers, plugins, memory, or global instructions.
- **Grading:** hidden test patch applied to the candidate tree after the trial,
  with test infrastructure (the bundle's `testPaths`, `conftest.py`, pytest
  config) restored first and candidate edits to it flagged; resolution = all
  FAIL_TO_PASS pass and all PASS_TO_PASS still pass. A `cassette-miss` (a request
  with no recording) leaves the trial unresolved and flagged. LLM judge (issue +
  reference + candidate) and localization/diff metrics are secondary.
- **Reporting:** agent wall-clock and USD per resolved task shown next to the
  human baseline (coding window vs review time); no counterfactual
  "would have merged sooner" claims; resolution also shown with `cassette-miss`
  trials excluded.
- **Transcript audit:** scan trial transcripts for solution reach (PR number,
  fix SHA, upstream URLs, forbidden commands) → disqualify, not penalize.
- **Studio task review page:** blind human labeling of leak levels and test
  fairness per task bundle, with agreement vs the LLM classifier. Requires a
  narrow, deliberate exception to Studio's "scoped writes only" rule.

PRD targets, their freeze invariants, and existing scoring are unchanged.

## Capabilities

- `brownfield-tasks` (new)
- `eval-orchestration` (added requirements; modified: trial isolation)
- `grading-rubric` (added requirements)
- `eval-reporting` (added requirements: human-baseline report, cassette-miss sensitivity)
- `trial-transcript-audit` (added requirement)
- `eval-studio` (modified: scoped writes; added: task review page)

## Out of scope

- Repositories other than paper-qa (the pilot); multi-language support.
- Synthesizing issues for PRs without a linked issue (SWE-rebench V2 found 23% of
  synthetic statements leak the solution).
- Reusing RepoLaunch / SWE-rebench env builders — paper-qa ships `uv.lock` at every
  base commit, so environments build directly. Revisit for lockfile-less repos.
- Protocol translation in the gateway (e.g. Codex to Anthropic models). It is a
  general capability that affects every track and overlaps the pluggable-models
  work, so it belongs in its own change. Brownfield needs only credential
  injection and tool enforcement.

## Impact

- New: `src/brownfield/` (miner, snapshotter, validator, classifier, bundle I/O),
  Studio review view + routes, brownfield prompt template in `config/`.
- New: model gateway (credential-injecting, tool-stripping egress proxy) run by
  the orchestrator outside the sandbox.
- Touched: orchestrator workspace seeding, provider network policy, per-trial
  home/config setup (all trials), `model probe` (gateway preflight for each
  transport), grading entry point, reporting, transcript audit.
- Data: `brownfield/` holds committed task bundles and labels (regenerable bulk gitignored; attribution in `brownfield/NOTICE`).
- Spend: mining/classification is cheap (≈$0.02/issue); trials are normal runs.
