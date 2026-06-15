# Tasks: Grade studio runs on the cc driver by default

## 1. Driver-aware gradeTrials

- [ ] 1.1 Add `driver?: "cc" | "sdk"` to `GradeOptions` (default `"cc"`); import the
  cc driver (`runEvaluatorCC` / `judgeQualityCC`) alongside the SDK pair.
- [ ] 1.2 Branch the evaluator + judge calls on the driver, passing the cc driver's
  extra args (`trialDir` verdict file) as `scripts/grade-trial.ts` already does.

## 2. Wire the default through callers

- [ ] 2.1 `src/studio/run-exec.ts`: grade with the cc driver (default), and confirm
  the detached run-worker inherits `CLAUDE_CODE_OAUTH_TOKEN` (ANTHROPIC_API_KEY
  blanked by the cc driver).
- [ ] 2.2 CLI `run --grade`: accept `--driver cc|sdk`, default cc — parity with
  `grade-trial.ts`.

## 3. Cost source

- [ ] 3.1 Record grading cost-source consistently per driver (cc subscription-metered;
  SDK API-priced); no scorecard schema change.

## 4. Validation

- [ ] 4.1 Unit: gradeTrials routes to cc by default, SDK when asked.
- [ ] 4.2 Live: one real studio run grades end-to-end on the subscription with no 400
  balance error; scorecard written.
- [ ] 4.3 `bun run test` green; `openspec validate add-studio-cc-grading`.
