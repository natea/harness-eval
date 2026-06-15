# Proposal: Fix the cc grading driver hanging on agent-started services

## Why

The subscription-backed grading driver (`src/grading/cc-driver.ts`, `runCC`) reads
the headless `claude -p` session's output straight off the process stdout pipe:

```ts
const stdout = await new Response(proc.stdout).text();   // reads to EOF
```

`new Response(proc.stdout).text()` resolves only at **EOF**, and a pipe reaches
EOF only when every writer of its write-end closes. The evaluator and judge prompts
explicitly instruct the agent to **start the service under test** ("start/stop the
service", "run the test suite"). When the agent runs `start.sh`, that daemon
**inherits `claude`'s stdout file descriptor** and keeps running after `claude`
would exit — so the write-end never closes, the read never EOFs, and the call
blocks until the per-call watchdog (`setTimeout(() => proc.kill(), timeoutMs)`,
20 min/judge sample) fires. The result is `exit 143` (SIGTERM), no captured result
line, and `"no result from claude (exit 143)"`. Worse, `proc.kill()` signals only
`claude`, not its process group, so the inherited daemon survives — which is how an
in-process grade can stay wedged indefinitely (the studio "grading forever" bug).

This is the exact footgun the repo already documents: *"Headless session output must
redirect to a file in the sandbox, not the exec stream — agent-built daemons inherit
stdout and hold the stream open forever."* The **worker** driver
(`src/driver/claude.ts`) already follows this rule — it redirects to
`/tmp/he-out-<…>.jsonl` and `cat`s the file after the process exits. Only the
**grading** driver still reads the exec stream, so only grading hangs. Observed live
on 2026-06-15: every `--driver cc` judge attempt failed or hung; `--driver sdk`
(separate tool loop, per-command timeouts) graded cleanly.

## What Changes

- **Redirect `runCC` output to a file in the session cwd** and read it back after
  the process exits — matching the worker driver. The exec stream is no longer the
  channel that must reach EOF, so a lingering daemon can't block the read.
- **Kill the whole process group on timeout** (not just the `claude` PID), so a
  service the grader started is torn down with it and cannot survive to hold pipes
  or ports.
- **Run each grading session in its own process group / session** (e.g. `setsid`
  or a detached group) so the group kill is well-defined and reliable.
- Keep the existing per-call timeout and the bounded retry on unparseable output;
  this change is about *capturing the result reliably*, not changing grading
  semantics. Adherence/judge scoring, verdict-file protocol, and the cc-vs-sdk
  deviation notes recorded in `grades.json` are unchanged.

## Capabilities

### Modified Capabilities

- `grading-rubric`: the functional evaluator and code-quality judge are unchanged in
  *what* they assess; this adds a reliability guarantee on *how* a grading session's
  output is captured — a service the session starts must not be able to wedge or
  time-out the grade.

## Impact

- `src/grading/cc-driver.ts` (`runCC`): file-redirect output capture + process-group
  spawn and group-kill on timeout. No interface change for callers
  (`runEvaluatorCC`, `judgeQualityCC`).
- No change to the SDK driver, the verdict-file schema, scoring, or results format.
- Removes the need for the launcher's grading timeout to ever fire on this cause
  (that timeout, added alongside this discovery, stays as a backstop for other hang
  modes).
- Risk surface: the group-kill must target only the grading session's group, never
  the harness; covered by spawning each session in a fresh detached group and
  killing by that group id.
- Validation: a regression test that points the grader at an artifact whose
  `start.sh` launches a foreground/long-lived daemon and asserts `runCC` returns the
  result (or times out *bounded*, killing the daemon) instead of blocking past the
  process exit.
