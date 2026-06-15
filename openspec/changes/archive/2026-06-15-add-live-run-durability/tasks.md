# Tasks: Durable live-run state and crash recovery

## 1. Persist run state

- [x] 1.1 Define the `run-state.json` shape (runId, kind, status incl. `interrupted`,
  stage, candidates, per-trial states, costUsdSoFar, startedAt, updatedAt, ownerPid,
  error) as a zod schema + `writeRunState` / `readRunState` / `listRunStates` helpers.
- [x] 1.2 Flush `run-state.json` at every lifecycle transition (status, stage,
  per-trial status, cost) from whatever owns the run.

## 2. Detached out-of-process execution

- [x] 2.1 Extract the live-run execution body (provision → matrix → grade → results)
  into a worker entrypoint `src/studio/run-worker.ts` that takes a runDir + persisted
  job spec and writes `run-state.json` throughout.
- [x] 2.2 Launcher: after auth + budget confirmation, write the job spec and spawn the
  worker as a **detached** child (own process group, stdio → `runs/<runId>/run.log`),
  recording `ownerPid`. Studio server no longer executes the run inline.
- [x] 2.3 Cancel: signal the worker (`SIGTERM`) so it aborts, tears down any in-flight
  sandbox through the provider, and writes terminal `cancelled` — no leaked resources.

## 3. Surface runs from disk state

- [x] 3.1 `/api/runs` / `/api/queue` (src/studio/index.ts) + `Runs.tsx#merge`: read
  on-disk `run-state.json`; precedence in-memory(none now) → results.json → run-state.
- [x] 3.2 Render a run with a non-terminal recorded status and a live `ownerPid` as
  running (with stage); a dead-owner non-terminal run as `interrupted` (new badge).

## 4. Startup reconciliation

- [x] 4.1 On studio start, scan `runs/*/run-state.json`; relabel in-progress states
  whose `ownerPid` is dead (`process.kill(pid, 0)`) to `interrupted`. Never
  re-execute. Leave states owned by a live process untouched.

## 5. Recovery surface

- [x] 5.1 Surface the recovery path for an interrupted run (point at
  `scripts/grade-trial.ts` + `scripts/finalize-run.ts`); no new recovery engine.

## 6. Validation

- [x] 6.1 Unit: `run-state` round-trip; status precedence (results > state); dead-
  `ownerPid` in-progress state reconciles to `interrupted`.
- [x] 6.2 Integration: a run with `run-state.json` + dead owner and no `results.json`
  lists as `interrupted` with its partial trials; a detached worker writes state that
  the server reads without executing the run inline.
- [x] 6.3 Smoke: a dry run executes in the detached worker, survives a simulated
  server restart (state still readable), and completes.
- [x] 6.4 `bun run test` green; `openspec validate add-live-run-durability`.
