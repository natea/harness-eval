## Context

The `SandboxProvider` contract (`provision → exec/writeFile/copyOut → destroy`,
plus `preflight`) abstracts isolation; today each backend (daytona, e2b, docker,
macos-vz, worktree) is a bespoke TS integration. SWE-ReX is a mature Python runtime
exposing the same idea over local/Docker/Fargate/EC2/Modal/Daytona via a server API,
with battle-tested massive parallelism (SWE-bench runs). Our drivers shell out to
CLIs (`claude -p`, `codex exec`) inside the sandbox, so any backend just needs to run
shell commands + move files + inject env — exactly SWE-ReX's surface.

## Goals / Non-Goals

**Goals:** determine if SWE-ReX can back a `SandboxProvider`, what backends/parallelism
it unlocks, and the integration cost; end with go/no-go.

**Non-Goals:** replacing existing providers; a production multi-backend build; using
SWE-agent as a harness. Throwaway spike only.

## Decisions

**1. Adapter over SWE-ReX's HTTP server; no Python in our process.**
SWE-ReX runs a server (FastAPI); the TS orchestrator speaks to it over HTTP. The
adapter maps `SandboxProvider` calls to SWE-ReX runtime calls (start session, run
command → exit code + output, upload/download file, close). Keeps the eval Bun/TS.

**2. Spike the cheapest backend first (local/Docker), then assess Modal/Fargate.**
Prove the contract end-to-end locally (no cloud spend), then judge whether
Modal/Fargate's serverless parallelism is worth a full build — that's the real draw
over e2b/daytona for big matrices.

**3. Reuse the per-sandbox secret-injection discipline.**
Worker auth is injected per sandbox at provision (the model-registry/worker-auth
rule), never baked into an image. Verify SWE-ReX env injection + teardown leave no
residue.

**4. Drivers must run inside SWE-ReX sandboxes.**
Confirm `claude-code` / `codex` CLIs (and the file-redirect output capture) work
under SWE-ReX's shell sessions — the same daemon-stdout footgun applies, so the
file-redirect pattern must hold.

## Risks / Trade-offs

- **TS↔Python HTTP boundary** → measure latency/overhead in the spike; it must not
  dominate per-trial time.
- **Backend maturity** (Daytona WIP; cloud backends need accounts) → spike local/
  Docker first; treat cloud as the upside, not the gate.
- **Contract mismatch** (e.g. copyOut, long-running start.sh) → map each contract
  method explicitly; the daemon-stdout/file-redirect rule must survive.
- **Overlap with existing providers** → only worth adopting if it adds backends
  (Modal/Fargate) or parallelism the current set lacks; otherwise no-go.

## Open Questions

- Does SWE-ReX's server expose file upload/download (for prompt-in, workspace-out)
  or must we do it over the shell session?
- Can a pinned trial image (Bun + Claude Code + Codex + toolchains) be used as the
  SWE-ReX sandbox image across backends?
- Modal/Fargate cost + cold-start vs. e2b/daytona for a representative matrix.
