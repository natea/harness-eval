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
- [ ] **Hidden-test grading** — restore test infra, apply `tests.patch`, offline suite, resolution verdict, `cassette-miss`
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

## Real-spend runs

(none yet)

## Commits

- `543742f` kickoff status file and plan
- `98d1d78` run config, seeding, prompt + patch capture (4.1/4.2/4.7)
- (next) trial isolation + web-tool kill-switch (4.6/4.8)

## Blockers

(none yet)
