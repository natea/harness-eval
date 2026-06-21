# Tasks: Explore SWE-ReX as a sandbox execution runtime

> Investigation + thin spike + recommendation. No production provider until go.

## 1. Investigation
- [ ] 1.1 Read SWE-ReX's runtime/server API; map each `SandboxProvider` method
  (provision, exec→exit-code, writeFile, copyOut, destroy, preflight) to a SWE-ReX
  call. Note gaps (file up/download vs. shell-only).
- [ ] 1.2 Confirm our `claude-code` / `codex` CLIs + the file-redirect output capture
  can run inside a SWE-ReX sandbox image (Bun + toolchains).

## 2. Thin spike (local/Docker backend, no cloud spend)
- [ ] 2.1 A throwaway `SandboxProvider` adapter that drives SWE-ReX's server over
  HTTP (start session, run command, file in/out, teardown).
- [ ] 2.2 Run one trial end-to-end through it: provision → cold-start contract
  (`setup.sh` then `start.sh`) → harness session → telemetry → teardown with no leak.
- [ ] 2.3 Verify per-sandbox secret injection (auth scoped to the sandbox, gone after
  teardown; nothing baked into the image).

## 3. Measure + recommend
- [ ] 3.1 Provisioning time + concurrent-sandbox throughput vs. e2b/daytona; the
  TS↔Python HTTP boundary cost.
- [ ] 3.2 Assess what Modal/Fargate would add for a 4×3 matrix (parallelism + cost).
- [ ] 3.3 Go/no-go: adopt a SWE-ReX-backed provider? which backend(s)? full-build cost?
- [ ] 3.4 `openspec validate explore-swe-rex-provider --strict`.
