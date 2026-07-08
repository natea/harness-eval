# harness-eval Setup Guide

## 1. Install dependencies

```sh
bun install
```

## 2. Configure environment

```sh
cp .env.example .env
```

Then add your API keys for whichever providers you want to use (Anthropic, Daytona, E2B, etc.).

## 3. Validate config

Run the following to ensure your registry, targets, and fixtures are valid:

```sh
bun run src/cli.ts validate
```

## 4. Run an evaluation

**Smoke test** (single trial, zero-dependency local provider):

```sh
bun run src/cli.ts run \
  --candidates superpowers \
  --trials 1 \
  --provider worktree
```

Full multi-candidate run (e.g. against Docker):

```sh
bun run src/cli.ts run \
  --candidates superpowers,compound,agentskills \
  --provider docker \
  --trials 3
```

## 5. Grade & report

**Grade the results** (post-hoc grading using evaluator + blind judge):

```sh
bun scripts/grade-trial.ts runs/<run-dir>/<trial-id> --driver cc
```

**Generate results + scorecard**:

```sh
bun run src/cli.ts report runs/<run-dir>
```

**Re-weight scores** without re-running anything:

```sh
bun run src/cli.ts report runs/<run-dir> --weights 0.5,0.35,0.075,0.075
```

## 6. View results

```sh
bun run dashboard          # http://127.0.0.1:4870 — simple leaderboard
bun run studio             # http://127.0.0.1:4871 — full Eval Studio UI
```

---

## Useful Docs

- **EVAL-STUDIO.md** — `docs/EVAL-STUDIO.md` — Full Eval Studio setup/guide
- **HARNESS-ONBOARDING.md** — `docs/HARNESS-ONBOARDING.md` — How to add new providers
- **BRING-YOUR-OWN-PRD.md** — `docs/BRING-YOUR-OWN-PRD.md` — Custom eval targets
- **MACOS-VZ-SETUP.md** — `docs/MACOS-VZ-SETUP.md` — macOS Virtualization provider setup
