# Tasks: Resilient Container Teardown

## 1. Provider teardown ladder

- [ ] 1.1 Add an optional `reapProcesses(name): Promise<number>` to the
      `CliContainerProvider` spec (OS-level fallback hook; returns # processes
      signalled). Default undefined → ladder stops at the CLI level.
- [ ] 1.2 Rewrite `CliContainerProvider.destroy()` as a bounded ladder:
      force-remove (short timeout) → kill verb (short timeout) → `reapProcesses`
      → if still present, log a leak with the manual command. Never throws.
- [ ] 1.3 Make the per-step timeouts + verbs part of the provider spec so docker
      and macos-vz can differ (docker: `rm -f`; macos-vz: `delete --force`,
      `kill`).

## 2. macos-vz reap

- [ ] 2.1 Implement `reapProcesses` in `macos-vz.ts`: find
      `container-runtime-linux … --uuid <name>` PIDs and the paired
      `Virtualization.VirtualMachine` (associated via the runtime, not a blind
      match); `kill -9` them.
- [ ] 2.2 Safety guard: never signal a `Virtualization.VirtualMachine` that
      cannot be tied to this trial's `he-*` uuid (start-time / open-file check),
      so an unrelated VM is never killed. Unit-test the guard.
- [ ] 2.3 docker `reapProcesses` is a no-op (daemon owns VM lifecycle).

## 3. cleanup command

- [ ] 3.1 `cmdCleanup`: per-binary listing verb (`container list -a` vs
      `docker ps -a --format`), then reap each `he-*` via the shared ladder.
- [ ] 3.2 Report per-CLI: removed / none / skipped-absent.

## 4. Orchestrator time-box

- [ ] 4.1 Time-box each trial's teardown so one wedged guest can't stall the run;
      a surviving VM is logged as a leak (not silently dropped).

## 5. Validation

- [ ] 5.1 Unit tests (mocked `cli`): force-remove timeout → kill → reap
      escalation; reap guard refuses an unrelated VM; cleanup listing parity.
- [ ] 5.2 Live (Apple Silicon): wedge a trial (daemon holding the channel),
      confirm `destroy()` frees it within budget without manual `kill -9`.
- [ ] 5.3 `bun run test` green; `bunx tsc --noEmit` clean; `openspec validate
      harden-container-teardown --strict`.
