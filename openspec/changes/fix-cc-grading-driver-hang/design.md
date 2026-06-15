# Design: Reliable output capture for the cc grading driver

## Root cause (confirmed live, 2026-06-15)

`runCC` (`src/grading/cc-driver.ts:34-84`):

```ts
const proc = Bun.spawn(["claude", "-p", …], { stdout: "pipe", stderr: "pipe" });
const timer = setTimeout(() => proc.kill(), opts.timeoutMs);
const stdout = await new Response(proc.stdout).text();   // ← blocks until pipe EOF
```

- `new Response(proc.stdout).text()` resolves at pipe **EOF** = all write-ends closed.
- The evaluator/judge agent starts the daemon under test (`bash start.sh`); the
  daemon **inherits `claude`'s stdout fd**, so the write-end stays open after the
  agent's turn ends.
- Read never EOFs → blocks → watchdog `proc.kill()` at the per-call timeout →
  `exit 143` (SIGTERM), no `result` line → `"no result from claude (exit 143)"`.
- `proc.kill()` hits only the `claude` pid, not the daemon, so on a long-lived
  in-process await (studio) the daemon survives and the read stays blocked — the
  "grading forever" wedge.

Evidence: both 2026-06-15 cc judge attempts died this way; the evaluator verdict for
superpowers even records *"Ran: timeout 15 bash start.sh (background)… stayed up
>10s"*. `--driver sdk` (custom tool loop, per-command `timeout_seconds`) was immune
and graded cleanly.

## Precedent already in the codebase

The **worker** driver does it correctly — `src/driver/claude.ts`:

```ts
const outFile = `/tmp/he-out-<sandboxId>-<step>.jsonl`;
// claude -p … > ${outFile} 2>&1     (redirect, don't stream)
const read = await sandbox.exec(`cat ${outFile}`);   // read AFTER exit
```

This change brings the grading driver in line with the worker driver. (Comment at
`claude.ts:41-43` already states the rationale.)

## Fix

1. **File redirect.** Spawn `claude -p … > <cwd>/.he-grade-<n>.jsonl 2>&1` via a
   shell, await `proc.exited`, then read the file. The stdout pipe is no longer the
   EOF-bearing channel, so an inherited daemon cannot block capture. Write the file
   under the session cwd (per-call unique name) and clean it up after read; it must
   not pollute the graded artifact or the blind copy (use a dotfile and delete, or
   write to a temp dir outside the workspace).
2. **Process-group spawn + group kill.** Start each session in its own process group
   (`setsid`/detached group). On timeout, `kill(-pgid, SIGTERM)` then `SIGKILL`,
   tearing down any service the grader launched. Never kill outside the group.
3. **Bounded, unchanged semantics.** Keep the per-call timeout and the existing
   retry-on-unparseable-output; the verdict-file protocol, scoring, medians, and the
   recorded cc-vs-sdk deviation notes are untouched.

## Out of scope

- The SDK driver (already reliable).
- The launcher grading timeout added during discovery — kept as a generic backstop.
- Changing grading prompts to forbid starting the service (the evaluator *must* run
  it to produce evidence; the fix is to capture/clean up correctly, not to stop the
  agent from testing the artifact).

## Validation

- Unit/integration regression: a fixture artifact whose `start.sh` execs a
  long-lived foreground server; assert `runCC` returns the parsed result after the
  agent finishes (or, on a forced hang, times out **bounded** and the daemon's
  process group is gone — no leaked listener on the fixture port).
- Re-run one real cc-driver grade end-to-end and confirm it completes without
  `exit 143`.
