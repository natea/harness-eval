# Brownfield implementation — status

Branch: `JTP75/brownfield-impl` (local only; no pushes, no PRs).
Base: `0d41d12` (`add-brownfield-track` + `brownfield-paperqa-labels`).

## Plan (broad strokes)

Critical path is a wet end-to-end trial: everything below is ordered so a real
paper-qa trial can run as early as possible.

- [ ] **Run config + issue variants** — `run --brownfield <repo> --tasks <ids|all> --variant body|body+human|body+all`
- [ ] **Workspace seeding + brownfield prompt** — sealed repo + `ISSUE.md` + anti-cheat template; byte-identical prompts across candidates
- [ ] **Patch capture** — candidate diff saved at trial end
- [ ] **Trial isolation** — fresh HOME/config, no operator MCP/plugins/skills/memory/instructions
- [ ] **Hidden-test grading** — restore test infra, apply `tests.patch`, offline suite, resolution verdict, `cassette-miss`
- [ ] **Web-tool kill-switch** — per harness; refuse candidates that can't comply
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

(none yet)

## Real-spend runs

(none yet)

## Blockers

(none yet)
