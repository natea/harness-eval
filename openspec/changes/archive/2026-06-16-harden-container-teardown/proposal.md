# Proposal: Resilient Container Teardown (don't strand wedged VMs)

## Why

`CliContainerProvider.destroy()` is one line — `container rm -f <name>` (alias
of `delete --force`) with the default 120 s exec timeout, a single attempt, and
no fallback. For docker that's fine. For the **macos-vz** provider (Apple
`container` over Virtualization.framework) it is not: teardown waits for the
guest to acknowledge process exit, and an Apple-container guest routinely does
not.

Observed in practice: three trial VMs left `running` after a run; every
`container delete -f` / `stop` / `kill` and even `container system stop` hung
indefinitely, the whole CLI froze (the apiserver serializes operations behind a
wedged runtime helper), and 12 GB stayed committed until the operator manually
`kill -9`'d the `container-runtime-linux --uuid he-*` helpers and their paired
VM processes. Root cause: a trial's agent starts the app it built (a long-lived
daemon) which keeps the exec/stdout channel open, so the runtime never sees a
clean exit — the same hazard as the "redirect headless output to a file" rule.
(Full write-up + manual recovery: `docs/MACOS-VZ-SETUP.md` → Troubleshooting.)

Two concrete defects fall out of this:

1. `destroy()` has no bounded escalation — one hung `rm -f` wedges teardown and,
   via the shared apiserver, the next trial's provisioning too.
2. `cmdCleanup()` (the `cleanup` CLI) uses docker-shaped `container ps -a
   --format '{{.Names}}'`, which the Apple CLI does not support — so it silently
   skips macos-vz and never reaps an orphaned `he-*` VM at all.

## What Changes

- **Bounded, escalating `destroy()`** for `CliContainerProvider`: try the
  provider's force-remove with a short timeout; if it does not return, escalate
  to the provider's configured kill ladder; if the CLI itself is wedged, fall
  back to an OS-level reap of the trial's own processes — the
  `container-runtime-linux … --uuid <name>` helper and its paired guest VM,
  matched strictly by the trial's container name so no unrelated VM is ever
  touched. `destroy()` never hangs longer than a bounded budget and never
  throws (teardown is best-effort by contract).
- **A provider "reap" hook** (`reapProcesses(name)`) so the OS-level fallback is
  provider-specific: macos-vz matches `container-runtime-linux --uuid he-*` +
  the paired `Virtualization.VirtualMachine`; docker has no host VM process, so
  its hook is a no-op (the daemon owns lifecycle).
- **Fix `cleanup` for the Apple CLI**: list via each binary's real listing verb
  (`container list -a` vs `docker ps -a`) and reap each `he-*` through the same
  bounded ladder, so `bun run src/cli.ts cleanup` actually frees macos-vz VMs.
- **Per-trial teardown is time-boxed** in the orchestrator so a single wedged
  guest cannot stall the run; a VM that survives the ladder is logged as a leak
  with the exact manual command, not silently ignored.

Out of scope: auto-restarting the `container` daemon (`system stop/start`) —
that is an operator action documented in the troubleshooting guide; and changing
why guests wedge (the headless-output/daemon hazard is handled elsewhere).

## Capabilities

### Modified Capabilities

- `eval-orchestration`: trial teardown gains a resilient-cleanup guarantee —
  bounded, escalating, OS-level fallback scoped to the trial's own processes,
  never stranding a VM or wedging the next trial.

## Impact

- `src/providers/cli-container.ts`: `destroy()` rewritten with the ladder; new
  optional `reapProcesses` in the provider spec.
- `src/providers/macos-vz.ts`: implements `reapProcesses` (uuid-scoped pgrep +
  `kill -9`, with a guard that refuses to kill a VM not owned by this trial).
- `src/providers/docker.ts`: no-op `reapProcesses`.
- `src/cli.ts` `cmdCleanup`: per-binary listing verb + shared ladder.
- Tests: ladder escalation with a mocked `cli` (force-remove times out → kill →
  reap), and cleanup listing parity per binary.
- Docs: `MACOS-VZ-SETUP.md` troubleshooting already added; cross-link from the
  cleanup section.
