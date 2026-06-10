# Proposal: Add macOS Virtualization Provider (Apple Silicon)

## Why

On Apple Silicon, macOS ships a native hypervisor stack — Virtualization.framework, and on macOS 26+ Apple's open-source Containerization framework with its `container` CLI, which boots each OCI container in its own lightweight Linux VM (sub-second boot, per-container kernel isolation). For local eval runs this offers stronger isolation than Docker's shared-VM model with comparable-or-lower overhead (one micro-VM per trial instead of one big always-on Docker Desktop VM), no Docker Desktop license/install, and zero cloud cost.

## What Changes

- Add a `macos-vz` isolation provider implementing `SandboxProvider` on top of Apple's `container` CLI (`container run`/`exec`/`cp`-equivalent/`rm`), consuming the same trial image definition (`infra/trial-image/Dockerfile`) as Docker and Daytona.
- Provider preflight: Apple Silicon + macOS version check, `container` CLI present (with install guidance: `brew install container` / Apple's installer), image built/present.
- Per-VM resource limits (memory/CPU) from run config, mirroring the Docker provider's flags.
- Extend provider enums/CLI with `macos-vz`; provenance records provider + image tag as usual.
- Fallback documentation: raw Virtualization.framework (custom Swift VM manager) considered and rejected for v1 — the Containerization `container` CLI is the supported, OCI-compatible surface over the same framework.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `eval-orchestration`: Trial isolation gains `macos-vz` as a local provider (Apple Silicon only) behind the same `SandboxProvider` interface, with platform preflight; provider set becomes {daytona, e2b, docker, macos-vz, worktree}.

## Impact

- `src/providers/macos-vz.ts` (subprocess calls to `container`, same shape as the Docker provider); enums/CLI widen.
- No new secrets or SaaS dependencies; darwin/arm64-gated at preflight.
- Depends on the shared trial image from `add-docker-local-provider` (D3 there); if that change hasn't landed, this one carries the image move.
- Risk surface: `container` CLI is young (macOS 26-era) — API/flag churn is likely; provider pins a minimum CLI version and fails preflight below it.
