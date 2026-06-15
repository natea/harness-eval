# Design: Grade studio runs on the cc driver by default

## Current state

`src/orchestrator/grade.ts` imports the SDK driver directly:

```ts
import { runEvaluator } from "../grading/evaluator";   // SDK (Anthropic API)
import { judgeQuality } from "../grading/judge";        // SDK (Anthropic API)
```

`scripts/grade-trial.ts` already chooses a driver (`--driver cc|sdk`, default `cc`)
and imports both the cc (`runEvaluatorCC` / `judgeQualityCC`) and SDK functions —
but `gradeTrials` (used by the studio + `run --grade`) only ever calls the SDK pair.
The SDK driver bills the Anthropic **API** account; the cc driver bills the **Max
subscription** via `CLAUDE_CODE_OAUTH_TOKEN`. With a $0 API balance, gradeTrials
always 400s.

## Change

Add a driver selector to `GradeOptions`:

```ts
interface GradeOptions {
  // …
  driver?: "cc" | "sdk";   // default "cc"
}
```

In the loop, branch the evaluator + judge calls:

```ts
const adherence = opts.driver === "sdk"
  ? await runEvaluator(target.plan, { model, workspaceDir, mockLinearUrl, stubAppServerPath })
  : await runEvaluatorCC(target.plan, { model, workspaceDir, trialDir, mockLinearUrl, stubAppServerPath });

const quality = opts.driver === "sdk"
  ? await judgeQuality({ model, blindWorkspaceDir })
  : await judgeQualityCC({ model, blindWorkspaceDir });
```

(Signatures differ slightly — cc takes `trialDir` for its verdict file; mirror what
`scripts/grade-trial.ts` already passes.)

`src/studio/run-exec.ts` calls `gradeTrials` with `driver: "cc"` (or relies on the
default). The CLI `run --grade` accepts `--driver` and defaults to cc too, matching
`grade-trial.ts`.

## Auth in the detached worker

The cc driver runs `claude -p` with `CLAUDE_CODE_OAUTH_TOKEN` set and
`ANTHROPIC_API_KEY` blanked (it already does this internally). The studio's detached
run-worker inherits `process.env`, so the token must be present in the studio
server's environment. Verify and document; no API key required for grading.

## Cost source

cc grading is subscription-metered like the worker. Record the grading cost source
consistently (the run already records `costSource`); the SDK path keeps API pricing.
No scorecard schema change.

## Out of scope

- The cc driver's reliability (file-capture + process-group teardown) — already
  shipped in `fix-cc-grading-driver-hang`.
- Cross-vendor / non-Anthropic judges — unchanged.

## Validation

- Unit: `gradeTrials` routes to cc by default and to SDK when asked (driver-selection
  branch covered without real spend via the existing injection seams where possible).
- Live: one real studio run grades end-to-end on the subscription, no 400 balance
  error, scorecard written. Existing grading tests stay green.
