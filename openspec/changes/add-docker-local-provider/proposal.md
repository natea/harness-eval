# Proposal: Add Docker Local Provider and Devcontainer

## Why

Every isolated trial currently requires a cloud sandbox (Daytona; E2B proposed separately) or falls back to git worktrees, which share the host OS and offer the weakest isolation. A Docker-based local provider gives true container isolation at zero cloud cost — bounded only by local hardware — and a devcontainer makes the whole eval environment reproducible for anyone cloning the repo. (Considered and rejected for the "local" role: self-hosting E2B — its Firecracker runtime needs Linux/KVM and a Terraform-deployed control plane, and cannot run natively on macOS at all; on a Mac, any microVM approach ends up inside a Linux VM, which is exactly what Docker Desktop already is.)

## What Changes

- Add a `docker` isolation provider implementing `SandboxProvider`: per-trial containers from a locally built image (`docker build` from the shared toolchain Dockerfile), exec via `docker exec`, artifact extraction via `docker cp`, teardown via `docker rm -f`.
- Promote the trial-environment Dockerfile to a shared location (`infra/trial-image/Dockerfile`) consumed by Docker locally and by the Daytona snapshot build, so all providers run the same pinned toolchain (Node 22, Bun, git, Claude Code 2.1.170, uid-1000 user).
- Add resource limits per container (`--memory`, `--cpus`) from run config, and a preflight check that the Docker daemon is reachable and the image tag exists (offering the build command if not).
- Add a `.devcontainer/devcontainer.json` so the harness itself (orchestrator, grading, tests) can be developed and run inside a container with Bun + Docker-outside-of-Docker for spawning trial containers.
- Extend `RunConfig`/provenance provider enums with `docker`; CLI `--provider docker`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `eval-orchestration`: Trial isolation requirement gains Docker as a local container provider behind the same `SandboxProvider` interface, including image preflight and per-container resource limits; provider set becomes {daytona, e2b, docker, worktree}.

## Impact

- No new secrets; no new SaaS dependencies. Requires Docker Desktop (macOS) or dockerd (Linux) on the host.
- `src/providers/docker.ts`; provider enums widen; `infra/daytona-snapshot/Dockerfile` moves to `infra/trial-image/Dockerfile` (Daytona build command updated).
- New `.devcontainer/` directory.
- Concurrency bounded by local RAM/CPU instead of cloud tier caps — local matrix runs (e.g. 3 concurrent 4GiB trials on a 32GiB machine) become free.
- Worktree provider remains as the zero-dependency fallback; Docker becomes the recommended local default.
