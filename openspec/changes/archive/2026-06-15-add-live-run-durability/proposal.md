# Proposal: Durable live-run state and crash recovery for the studio

## Why

Studio live runs execute **in-process** in the studio server, and their job state
(the `QueueEntry`) lives **only in memory** (`jobs: Map` in `src/studio/launcher.ts`).
The `eval-studio` capability already promises: *"when tracking is lost (e.g. server
restart) the run's on-disk artifacts SHALL remain readable through the Runs view."*
In practice that promise is **violated**: when the studio server restarts or crashes,

1. the in-flight run is **killed** (build/grade ran inside that process), and
2. the queue entry is **lost**, and because the Runs view only surfaces disk runs
   that have a `results.json`, an interrupted run — which has `provenance.json`,
   transcripts, and a partial workspace but no `results.json` — **disappears from
   the UI entirely**, leaving orphaned artifacts with no trace.

Observed live on 2026-06-15: `run-2026-06-15T03-00-46-945Z` (superpowers +
agent-skills) vanished from the Runs list after the studio server was restarted,
even though both trials' artifacts were on disk. The operator had no way to see it
had been interrupted, what state it reached, or how to recover it.

## What Changes

- **Persist live-run state to disk.** The launcher writes a per-run `run-state.json`
  under the run directory and updates it at each lifecycle transition (enqueued →
  building → evaluating/scoring `<trial>` → finalizing → terminal), recording
  runId, kind, status, current stage, per-trial states, cost-so-far, timestamps,
  and the owning server's pid/id. This is the durable mirror of the in-memory
  `QueueEntry`.
- **Surface interrupted runs in the Runs view.** `/api/runs` (and the Runs merge)
  read `run-state.json` so a run with partial artifacts and no `results.json`
  appears as **`interrupted`** instead of vanishing — with its reached stage and
  partial per-trial states visible.
- **Reconcile on startup.** When the studio starts, any `run-state.json` marked
  in-progress whose owning process is no longer alive is reconciled to
  `interrupted` (it cannot still be running — the process that hosted it is gone).
- **Execute the run out-of-process.** After authorization + budget confirmation
  (which stay synchronous in the studio server), the run executes in a **detached
  child process** (its own session/process group, stdio redirected to a run log) so a
  studio **UI restart or crash does not kill the build/grade**. The child owns the
  run lifecycle and writes `run-state.json`; the studio server becomes a reader of
  on-disk state plus a controller (cancel = signal the child).
- **Offer recovery.** An interrupted run that built artifacts can still be finished
  out of band with the existing checkpointed tools (`scripts/grade-trial.ts` +
  `scripts/finalize-run.ts`); the Runs view surfaces this path. With out-of-process
  execution, a UI restart no longer interrupts a *healthy* run — interruption now
  means the run process itself died, and recovery applies to that genuine case.

## Capabilities

### Modified Capabilities

- `eval-studio`: tightens the live-run tracking guarantee — losing in-memory
  tracking must leave the run **visible as interrupted and recoverable**, not merely
  "artifacts still on disk somewhere" — and moves run execution **out-of-process** so
  the studio UI is a reader/controller of a run that survives a server restart. Adds
  durable run-state, detached execution, startup reconciliation, and a recovery path.

## Impact

- New `run-state.json` writer in `src/studio/launcher.ts`, updated wherever the
  `QueueEntry` transitions (status/stage/trials/cost).
- `src/studio/index.ts` `/api/runs` + `src/studio/views/Runs.tsx` merge: include
  on-disk run-state so interrupted runs render (new `interrupted` row status).
- Startup reconciliation pass (liveness check by recorded pid) marking stale
  in-progress states as `interrupted`.
- No change to build/grade semantics, fairness, provenance, or results schema; this
  is observability + recovery around the existing run lifecycle.
- Risk surface: the pid-liveness check must not resurrect or double-run a job; it
  only relabels stale state and never re-executes. Recovery is operator-initiated
  via the existing checkpointed scripts.
