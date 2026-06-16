# Delta: eval-orchestration — resilient container teardown

## ADDED Requirements

### Requirement: Resilient sandbox teardown
Destroying a trial sandbox SHALL be bounded in time and MUST free the
sandbox's resources even when the container runtime is unresponsive. Teardown
SHALL escalate: a force-remove with a short timeout, then a kill, then — if the
CLI itself does not return — an OS-level reap of the trial's own runtime/VM
processes, matched strictly by the trial's container name so that no unrelated
virtual machine or process is ever signalled. Teardown SHALL NOT throw and
SHALL NOT block longer than its bounded budget; a sandbox that survives the full
ladder SHALL be reported as a leak with the exact manual remediation command.

#### Scenario: Force-remove hangs, escalates to kill then OS reap
- **WHEN** a trial's force-remove does not return within its timeout (e.g. an
  Apple `container` guest holds a channel open and never acknowledges exit)
- **THEN** teardown escalates to a kill and, if the CLI is still wedged, reaps
  the trial's own `container-runtime-linux` helper and its paired guest VM
  process at the OS level, freeing the committed memory

#### Scenario: OS-level reap never touches an unrelated VM
- **WHEN** the OS-level fallback runs while another, unrelated virtual machine
  is also present on the host
- **THEN** only processes whose container name/uuid matches the trial being torn
  down are signalled, and any VM not owned by this trial is left running

#### Scenario: Teardown is bounded and non-fatal
- **WHEN** every teardown step fails or times out
- **THEN** `destroy()` returns within its bounded budget without throwing, and
  logs the surviving sandbox as a leak together with the manual command to
  remove it

### Requirement: Orphan cleanup across providers
The `cleanup` command SHALL reap orphaned `he-*` trial sandboxes for every
supported container CLI using that CLI's own listing verb, not a single
container runtime's flags, and SHALL apply the same bounded escalating teardown
as per-trial destruction. A CLI that is installed but lists no orphans SHALL be
reported as clean; a CLI that is absent SHALL be skipped silently.

#### Scenario: Cleanup reaps an orphaned macos-vz VM
- **WHEN** `cleanup` runs after a crashed macos-vz run left an `he-*` VM
- **THEN** it lists the orphan via the Apple CLI's listing verb (not a
  docker-only `ps --format` invocation) and reaps it through the bounded ladder,
  freeing its memory

#### Scenario: Cleanup is provider-agnostic
- **WHEN** both docker and the Apple `container` CLI are installed
- **THEN** cleanup checks each with its own listing verb and reports per-CLI
  results, removing `he-*` orphans wherever they exist
