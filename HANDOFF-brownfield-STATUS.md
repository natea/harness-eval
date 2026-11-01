# Brownfield implementation — status

Branch: `JTP75/brownfield-impl` (local only; no pushes, no PRs).
Base: `0d41d12` (`add-brownfield-track` + `brownfield-paperqa-labels`).

## Plan (broad strokes)

Critical path is a wet end-to-end trial: everything below is ordered so a real
paper-qa trial can run as early as possible.

- [x] **Run config + issue variants** — `run --brownfield <repo> --tasks <ids|all> --variant body|body+human|body+all`
- [x] **Workspace seeding + brownfield prompt** — sealed repo + `ISSUE.md` + anti-cheat template; byte-identical prompts across candidates
- [x] **Patch capture** — candidate diff saved at trial end
- [x] **Trial isolation** — fresh HOME/config, no operator MCP/plugins/skills/memory/instructions
- [x] **Hidden-test grading** — restore test infra, apply `tests.patch`, offline suite, resolution verdict, `cassette-miss`
- [x] **Web-tool kill-switch** — per harness; refuse candidates that can't comply
- [ ] **Gateway + probe** — credential injection, model/tool enforcement, `model probe` extension (4.3/4.4/4.5)
- [ ] **Wet evals** — n=1 smoke (6.2) then adversarial smoke (6.1), real Anthropic spend; OpenAI if the key works
- [ ] **Reporting + secondary signals + audit + κ** — 5.4, 5.2, 5.3, 2.6
- [ ] **Full-suite validator** — 3.4 (before / gold×2, F2P / P2P / flaky / env-broken)

## Baseline (pre-existing, not mine)

- `bun run check`: 3 `tsc` errors in `tests/e2b-provider.test.ts`; biome format
  drift across `src/` (studio, preview, dashboard, report).
- `bun run test`: `tests/unit.test.ts` (6 vs 8 candidates); Studio dry-run
  timeouts in `live-run-durability`, `studio-e2e`, `studio-live-runs`.
- Everything brownfield passes: 46 tests, `validate --brownfield` = 111 bundles.

## Decisions without asking

1. Brownfield runs default to the `worktree` provider (docker image has no
   uv/pytest); `--provider` still overrides.
2. Matrix for a brownfield run is candidates × tasks, one trial each
   (`trialsPerCandidate` is fixed at 1; `--tasks` carries the repetition).
3. Sealed repos are cached under `runs/.cache/sealed/<owner>__<repo>/<base12>`
   and re-verified before reuse (`.gitignore`d, never committed).
4. The trial environment is prebuilt only for the worktree provider (it shares
   the host filesystem); other providers get a warning and rely on the agent.
5. `--grade` is rejected for brownfield runs until hidden-test grading (5.1)
   exists, rather than silently skipping grading.
6. Trial env artifacts are kept out of the diff via `.git/info/exclude` (local
   only, untracked) because `git add` rejects pathspecs naming ignored paths.
7. Isolation/kill-switch flags are passed only for brownfield trials (`isolated`),
   so PRD sessions keep their frozen command surface; HOME/config env scrubbing
   applies to every worktree trial.
8. Harnesses without a verified web kill-switch (zeroclaw) are refused for
   brownfield; codex's `tools.web_search=false` is unverified pending 6.1.
9. Trial isolation drops all host env except a PATH/locale allowlist; worker
   auth arrives only through the explicit env argument.
10. Grading replays `candidate.patch` onto a pristine sealed base instead of the
    archived workspace: env/test tampering cannot reach the verdict. Test infra
    (testPaths, conftest.py, pytest config) is restored from base and flagged.
11. `pyproject.toml` is restored only when `[tool.pytest.ini_options]` changed,
    so a legitimate dependency edit survives grading.
12. Grading runs automatically for brownfield runs (`--no-grade` opts out).
13. Test runs get a curated host env (PATH/HOME/locale only): an ambient
    `AGENT=1` in the operator shell invalidated paper-qa's pydantic Settings.
14. Added API-key Claude Code profiles (`claude-{haiku-4-5,sonnet-4-6,opus-4-6}-key`)
    because the operator has no Max OAuth token; `model probe` verified haiku.
15. `--trial-cost` / `--run-cost` override the budget caps per run.

## Real-spend runs

1. `runs/run-2026-11-01T06-58-39-202Z` — bare × paper-qa `pr1262-issue1257`,
   claude-haiku-4-5-key (Anthropic API), 8.2m, $0.71, **unresolved
   (fail-to-pass)**. Patch touched `src/paperqa/agents/search.py`; hidden test
   genuinely fails on the candidate tree. Proves the full loop: seed → agent →
   patch → hidden-test grading → report.
2. `runs/run-2026-11-01T07-20-32-157Z` — bare × `pr1298-issue1273`,
   claude-sonnet-4-6-key, 3.9m, $0.58, **unresolved (fail-to-pass)**. The
   candidate edited `tests/test_paperqa.py`; grading restored it and flagged
   `test-infra-modified`.
3. `runs/run-2026-11-01T07-31-23-833Z` — gateway validation attempt, **$0**: the
   first gateway response exposed `content-encoding` after Bun had already
   decompressed it, so Claude Code raised a BrotliDecompressionError. Fixed
   (headers stripped) and covered by a test.
4. `runs/run-2026-11-01T07-34-41-008Z` — bare × `pr1262-issue1257`,
   claude-sonnet-4-6-key **through the gateway**, 17.7m, $2.18, **unresolved
   (fail-to-pass)**, 65 turns, 63 proxied requests (all 200). Gateway end-to-end
   verified with a placeholder credential in the sandbox.
5. `runs/run-2026-11-01T07-56-24-179Z` — adversarial smoke (`--adversarial`),
   haiku + gateway, **disqualified:solution-reach**: the worker looked up
   `github.com/Future-House/paper-qa/pull/1251` and the audit caught it before
   grading. Confirms the audit path; also shows worktree egress is still open
   (4.4 network lockdown pending).
6. `runs/run-2026-11-01T07-14-02-159Z` — codex-baseline × `pr1298-issue1273`,
   gpt-5-codex (OpenAI), **$0.00**: the account has no credits and no access to
   `gpt-5-codex`/`gpt-5.1-codex`; every model 404s or reports "no credits".
   OpenAI half of the pilot is blocked on billing, not on code.

Total real spend: **≈$3.50 Anthropic** (haiku probes + two mini runs + sonnet),
**$0 OpenAI**. Target caps ($40/$20) untouched.

## Commits

- `543742f` kickoff status file and plan
- `98d1d78` run config, seeding, prompt + patch capture (4.1/4.2/4.7)
- `8a2e489` trial isolation + web-tool kill-switch (4.6/4.8)
- `b39d0d5` hidden-test grading from a pristine base (5.1)
- `54b9ef1` report, API-key profiles, clean test env (5.4)
- `59782ec` model gateway + inter-human κ (4.4/2.6)
- `b561168` solution-reach audit + lean archives (5.3)

## Labels (task 2.6)

κ over the 14 reviewed paper-qa tasks (50 item labels): human-vs-LLM
**κ = 0.34** (quadratic-weighted 0.40, observed 0.52, 24 disagreements).
Only one task has a second human review, so human-vs-human κ is a single pair
(n=1, κ = 0). `agreementSummary` now reports both; the read model exposes
`interHuman` per task.

## Blockers

(none yet)
