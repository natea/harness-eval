# Design: Docker Local Provider and Devcontainer

## Context

`SandboxProvider` already abstracts provision/exec/copyOut/writeFile/destroy. The Daytona shakedown produced a defect checklist that maps directly onto Docker design choices: image user uid (must be a normal uid-1000 user), env propagation (per-exec, not pipeline-first-command), long-running daemons holding exec streams (session output to file), and lifetime policies (no auto-stop equivalents; containers live until removed). Local execution reintroduces one risk cloud sandboxes removed: trial code (and graded artifacts) executes on the user's machine — containers restore that boundary, unlike the worktree fallback.

## Goals / Non-Goals

**Goals:**
- Zero-cloud-cost trials with real isolation; same toolchain image as cloud providers.
- One Dockerfile as the single source of truth for the trial environment across Daytona and Docker.
- Devcontainer for reproducible harness development (and CI later).

**Non-Goals:**
- Rootless/gVisor hardening beyond stock Docker isolation (trial code is LLM-written, not adversarial; stock namespaces match the threat model already accepted for cloud sandboxes).
- Docker-based *orchestrator* hosting for laptop-off runs (that's the cloud orchestrator's job; a laptop running Docker is by definition on).
- Windows support (darwin/linux only, matching the rest of the harness).

## Decisions

- **D1 — Plain `docker` CLI via subprocess, no Docker SDK dependency.** The provider shells out (`docker run -d`, `docker exec`, `docker cp`, `docker rm -f`) exactly as the worktree provider shells out to git/zsh. Rationale: dockerode and similar add a daemon-socket dependency surface for five commands; the CLI is universally present where Docker is.
- **D2 — Container lifecycle:** provision = `docker run -d --name he-<trial-id> --memory <limit> --cpus <limit> <image> sleep infinity`; exec = `docker exec -w <cwd> -e K=V he-<trial-id> bash -lc <cmd>`; writeFile = `docker cp` of a temp file; copyOut = `docker cp` of the workspace dir; destroy = `docker rm -f`. Session output continues to write to an in-container file (daemon-pipe lesson) and is `docker cp`'d back.
- **D3 — Shared image:** `infra/trial-image/Dockerfile` (moved from `infra/daytona-snapshot/`), built locally as `harness-eval-trial:2.1.170-1` where the tag encodes the Claude Code pin plus an image revision. The Daytona snapshot build consumes the same file (`daytona snapshot create -f infra/trial-image/Dockerfile`). Image tag recorded in provenance as `snapshotId`.
- **D4 — Preflight:** `docker info` reachable; image tag present (`docker image inspect`) else fail with the exact build command; configured memory × concurrency sanity-checked against host RAM with a warning (not a hard fail — Docker handles overcommit).
- **D5 — Devcontainer:** `.devcontainer/devcontainer.json` on the trial image plus Bun, mounting the host Docker socket (docker-outside-of-docker) so trial containers are siblings, not nested. This keeps the provider code identical inside and outside the devcontainer.

## Risks / Trade-offs

- [Host resource exhaustion during concurrent trials] → per-container `--memory`/`--cpus` from run config; preflight RAM warning; default local concurrency 2.
- [macOS Docker Desktop VM overhead (file IO, memory ballooning)] → workspace lives inside the container (no bind mounts on the hot path); only archival crosses via `docker cp`.
- [Image/Daytona snapshot drift] → single Dockerfile (D3); provenance records the tag; CI task later can assert digest parity.
- [Stale containers after crashes] → deterministic names (`he-<trial-id>`) + provision-time `docker rm -f` of any namesake; a `cleanup` CLI subcommand lists/removes `he-*` containers.
- [Worktree fallback now redundant-looking] → kept: it is the only zero-dependency provider (CI machines without Docker, quick smoke tests).

## Open Questions

- Default resource limits per trial container (proposal: 4GiB / 2 CPUs to mirror cloud sandboxes — keeps cross-provider behavior comparable).
- Whether to wire the e2e dry-run test (8.2) to Docker when available, falling back to worktree otherwise.
