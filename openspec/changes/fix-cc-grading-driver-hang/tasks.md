# Tasks: Fix the cc grading driver hanging on agent-started services

## 1. Output capture

- [x] 1.1 `runCC`: redirect `claude -p` output to a per-call file outside the graded
  workspace (shell `> file 2>&1`), await `proc.exited`, then read+parse the file —
  stop reading `proc.stdout` directly. Mirror `src/driver/claude.ts` worker driver.
- [x] 1.2 Clean up the capture file after read; ensure it never lands in the
  workspace or the blind copy (no contamination of the judge).

## 2. Process-group teardown

- [x] 2.1 Spawn each grading session in its own process group (`setsid`/detached).
- [x] 2.2 On per-call timeout, kill the whole group (SIGTERM→SIGKILL), never outside
  it; classify the timeout as judge/evaluator infra (retry/record), not a 0-quality
  artifact signal.

## 3. Validation

- [x] 3.1 Regression test: fixture artifact whose `start.sh` launches a long-lived
  foreground server; assert `runCC` returns the parsed result after the agent
  finishes and leaves no listener on the fixture port (group killed).
- [x] 3.2 Run one real `--driver cc` grade end-to-end; confirm it completes without
  `exit 143` / "no result from claude".
- [x] 3.3 `bun run test` green; `openspec validate fix-cc-grading-driver-hang`.
