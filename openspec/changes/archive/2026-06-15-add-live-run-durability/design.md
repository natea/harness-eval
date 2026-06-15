# Design: Durable live-run state and crash recovery

## Observed failure (2026-06-15)

- Studio server restarted (new pid on :4871).
- `run-2026-06-15T03-00-46-945Z` (in-flight: superpowers built, agent-skills still
  building) **disappeared from the Runs list**.
- On disk it still had `trials/superpowers-t1/{provenance.json,transcripts,workspace}`
  but **no `results.json`** → `/api/runs` (which surfaces completed disk runs) didn't
  list it, and the in-memory queue that had been tracking it died with the server.

Root cause: live-run state is in-memory only; the Runs view's disk source keys on
`results.json`, so an interrupted run is invisible.

## State file

`runs/<runId>/run-state.json`, written by the launcher on every `QueueEntry`
transition:

```json
{
  "runId": "run-…",
  "kind": "live",
  "status": "running",            // running | completed | error | cancelled | interrupted
  "stage": "scoring superpowers-t1 (1/2)",
  "candidates": ["superpowers", "agent-skills"],
  "trials": { "superpowers-t1": "completed", "agent-skills-t1": "running" },
  "costUsdSoFar": 0,
  "startedAt": "2026-06-15T03:00:46.945Z",
  "updatedAt": "2026-06-15T03:03:29.081Z",
  "ownerPid": 78211,              // studio server process that owns this job
  "error": null
}
```

`interrupted` is a new terminal-ish status that exists only on disk (the in-memory
`QueueEntry` never sets it; reconciliation does).

## Write points

The launcher already mutates `entry` at each transition (status, stage, trials,
cost). Wrap those mutations so each one also flushes `run-state.json` (a single
`writeRunState(runDir, entry)` helper called after each mutation, or a small setter).
Terminal states (completed/error/cancelled) write the final state; `results.json`
remains the authoritative completed-run artifact.

## Runs view merge

`/api/runs` and `Runs.tsx#merge` gain a third source: on-disk `run-state.json` files.
Precedence: live in-memory queue > `results.json` (completed) > `run-state.json`
(interrupted/partial). A run present only via `run-state.json` with a non-terminal
recorded status renders as **`interrupted`** with its last stage and partial trials.

## Startup reconciliation

On studio start, scan `runs/*/run-state.json`. For any with status `running` (or a
non-terminal stage):
- if `ownerPid` is alive **and** belongs to a studio process → leave as-is (another
  live server owns it — multi-server case),
- else → rewrite status to `interrupted` (the owning process is gone; it cannot still
  be running).

Reconciliation only **relabels**; it never re-executes a job. PID liveness is
best-effort (`process.kill(pid, 0)`); a recycled pid at worst leaves a dead run shown
as running until the next scan, which is strictly better than vanishing.

## Recovery

An `interrupted` run that built artifacts is finished out of band with the existing
checkpointed tools:
- `scripts/grade-trial.ts <run> <trial> [--driver …]` (per-trial, resumable),
- `scripts/finalize-run.ts <run>` (assemble `results.json` + scorecard from on-disk
  artifacts).

The Runs view surfaces this as the recovery path for interrupted runs. No new
recovery engine is built; this change makes the orphan **visible** and points at the
tools that already exist.

## Detached execution (in scope)

After authorization + budget confirmation (synchronous, in the studio server), the
run executes in a **detached child process** (`bun` worker, own session/process
group, stdio redirected to `runs/<runId>/run.log`). The child owns the lifecycle and
writes `run-state.json`; the studio server reads on-disk state and controls the run
by signalling the child (cancel = `SIGTERM` → graceful sandbox teardown → `cancelled`).
A studio UI restart/crash no longer kills a healthy run — it keeps running, and the
restarted server re-attaches by reading its `run-state.json`.

## Decision: build vs buy (a fork we may revisit)

**Context.** "Background jobs that survive restarts" is a solved problem with
off-the-shelf systems. We evaluated adopting one versus building the minimum.

| Option | Gives | Costs | Fit today |
| --- | --- | --- | --- |
| **File-state + detached process** (chosen) | visibility, recovery, survival across UI restart | none — no new deps/services | single-operator, local-first; `runs/` is already the durable ground truth |
| **BullMQ (Redis)** | durable queue, retries, concurrency, events, distributed workers | a running Redis server; re-architect runs as queue jobs | overkill for a few long, expensive, human-supervised runs on one host |
| **pg-boss / Graphile Worker (Postgres)** | durable queue + queryable run history in one SQL store | a running Postgres server | only if we want a real DB for run history anyway |
| **Temporal / Inngest / Trigger.dev** | durable multi-step workflow engine | a service to operate or a hosted dependency | far beyond current needs |

**Why file-state + detached wins now.** The expensive work product (provenance,
transcripts, workspace, `grades.json`) is *already* durable on disk, and resumption
tools (`grade-trial.ts`, `finalize-run.ts`) already exist. The missing pieces are
lightweight state visibility and process survival — neither of which needs a broker.
A queue's real wins (distributed workers, retries-at-scale, high throughput) don't
match a workload of a handful of supervised runs per machine, and Redis/Postgres
would break the repo's clone-and-go, zero-services property.

**Revisit trigger — when build-vs-buy flips to "buy".** Reopen this decision and
adopt a real job system (BullMQ/Redis or pg-boss/Graphile/Postgres; a workflow
engine if steps grow) when **harness-eval becomes a multi-tenant hosted service** —
i.e. any of:
- multiple concurrent operators/tenants needing isolation, auth, and quotas;
- runs dispatched across **multiple worker machines** (not one host);
- a need for **at-least-once delivery, automatic retries/backoff, and priority
  scheduling** across many queued runs;
- a hosted control plane where the API and workers scale independently and run
  history must be queryable/persistent beyond the local `runs/` tree.

At that point `run-state.json` becomes the local-dev backend of a `RunStore`
abstraction whose hosted implementation is backed by the chosen queue/DB; the
detached-child worker generalizes to a queue-consumer worker. The state schema and
lifecycle defined here are intended to port to that backend without changing the
run/grade semantics.

## Validation

- Unit: `writeRunState` round-trips; the merge ranks queue > results > state; a
  state file with `running` + dead `ownerPid` reconciles to `interrupted`.
- Integration: simulate a launch that writes `run-state.json` then "loses" the
  in-memory entry (no queue); assert the Runs payload still lists the run as
  `interrupted` with its partial trials.
