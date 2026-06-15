# Proposal: Grade studio runs on the subscription (cc) driver by default

## Why

`gradeTrials` (`src/orchestrator/grade.ts`) — the grading path shared by the CLI
`run --grade` and the studio's run executor — hard-codes the **SDK driver**
(`runEvaluator` from `./evaluator`, `judgeQuality` from `./judge`). The SDK driver
calls the Anthropic API directly and **bills the Anthropic API account**, which is
the account currently carrying a **$0 balance**. Result: every real studio run
fails at grading with:

> `400 invalid_request_error: "Your credit balance is too low to access the Anthropic API."`

Observed live on 2026-06-15: `run-2026-06-15T14-26-19-011Z` **built both trials**
(spending $0.46 on the subscription worker) and then **died at grading** on the API
balance, never producing a scorecard. So the studio cannot currently complete a real
run's grading at all.

This contradicts the documented intent (README: *"Both run on your Claude
subscription via headless Claude Code (default) or the Anthropic SDK
(`--driver sdk`)"*) — the **default is supposed to be the subscription cc driver**,
which `scripts/grade-trial.ts` already uses and which `fix-cc-grading-driver-hang`
made reliable (file-capture + process-group teardown). Only `gradeTrials` was never
wired to it.

## What Changes

- **`gradeTrials` becomes driver-aware**, defaulting to the **cc (subscription)
  driver** (`runEvaluatorCC` / `judgeQualityCC`), with the SDK driver as an opt-in.
  This matches `scripts/grade-trial.ts` and the documented default, and makes studio
  grading bill the Max subscription (`CLAUDE_CODE_OAUTH_TOKEN`) instead of the API
  account.
- **The studio passes the cc driver** (or relies on the new default) so real runs
  grade on the subscription and stop dying on the API balance.
- **Cost-source accounting** reflects the driver: cc grading is subscription-metered
  (recorded consistently with how worker cc cost is handled), the SDK path keeps its
  API-priced accounting.
- **The judge-independence and blind-judge guarantees are unchanged** — only the
  transport changes; the cc driver already runs the same evaluator/judge prompts on
  the same scrubbed, workspace-blind copy.

## Capabilities

### Modified Capabilities

- `grading-rubric`: pins the **default grading driver** to the subscription
  (Claude Code) driver for orchestrated runs, with the SDK driver as an explicit
  opt-in — so a $0 API balance never silently blocks grading on the subscription.

## Impact

- `src/orchestrator/grade.ts`: add a `driver: "cc" | "sdk"` option (default `cc`);
  branch between `runEvaluatorCC`/`judgeQualityCC` and `runEvaluator`/`judgeQuality`.
  This mirrors `scripts/grade-trial.ts`, which already selects between the two.
- `src/studio/run-exec.ts` (and the CLI `run --grade`): pass/accept the driver; the
  studio defaults to cc. `--driver sdk` remains available for the API path.
- Worker auth: the cc grading driver needs `CLAUDE_CODE_OAUTH_TOKEN` with
  `ANTHROPIC_API_KEY` blanked in the child env (the cc driver already does this);
  confirm the studio's detached worker inherits the token.
- No change to grading semantics, the verdict schema, or results format; this is a
  transport/billing default, not a rubric change.
- Validation: one real studio run grades end-to-end on the subscription without the
  400 balance error; existing grading tests stay green.
