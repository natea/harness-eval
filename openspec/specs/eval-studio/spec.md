# eval-studio Specification

## Purpose
TBD - created by archiving change add-live-run-durability. Update Purpose after archive.
## Requirements
### Requirement: Durable live-run state and crash recovery
The studio SHALL persist each live run's tracking state to disk so that losing
in-memory job tracking (server restart or crash) leaves the run **visible and
recoverable** rather than absent. The studio SHALL write a per-run state record under
the run directory and update it at each lifecycle transition (enqueued, building,
grading per trial, finalizing, and the terminal completed/error/cancelled), recording
at least the run id, kind, status, current stage, per-trial states, cost-so-far,
timestamps, and the owning process id. A real run SHALL execute in a process separate
from the studio HTTP server (after authorization and budget confirmation) so that a
studio server restart or crash does NOT terminate an in-flight build or grade; the
studio server SHALL read run state from disk and control a run by signalling its
owning process. The Runs view SHALL surface a run that exists only via this on-disk
state — with partial artifacts and no `results.json` — as an `interrupted` run when
its owning process is gone, or as running (with stage) when its owner is alive,
showing per-trial states either way. On startup the studio SHALL reconcile any
persisted in-progress state whose owning process is no longer alive to `interrupted`,
and SHALL NOT re-execute it. Recovery of an interrupted run that produced artifacts
SHALL be available through the existing checkpointed grading and finalize tools.

#### Scenario: Healthy run survives a server restart
- **WHEN** the studio server restarts or crashes while a real run is mid-flight in its
  own process
- **THEN** the run process keeps building/grading, and the restarted studio re-attaches
  by reading the run's on-disk state, showing it as still running with its current stage

#### Scenario: Interrupted run stays visible after its owner dies
- **WHEN** a run's owning process dies mid-flight and its in-memory tracking is lost
- **THEN** the Runs view still lists the run as `interrupted`, showing the stage it
  reached and the state of each trial, instead of the run disappearing

#### Scenario: Stale in-progress state is reconciled, not resumed
- **WHEN** the studio starts and finds a persisted run state marked in-progress whose
  recorded owning process is no longer alive
- **THEN** the studio relabels that run `interrupted` and does not re-execute or
  resume it

#### Scenario: Recovery of an interrupted run
- **WHEN** an interrupted run has trials whose builds completed on disk
- **THEN** the operator can finish it with the checkpointed grade and finalize tools
  to produce `results.json` and a scorecard, without re-running the build

#### Scenario: Live tracking still takes precedence
- **WHEN** a run is actively tracked in memory by the current server
- **THEN** the Runs view reflects the live in-memory status, and the on-disk state is
  the durable mirror used only when in-memory tracking is absent

