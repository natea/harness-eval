# Design: macOS Virtualization Provider

## Context

Apple Silicon Macs expose hardware virtualization through Virtualization.framework. Apple's Containerization framework (open-sourced 2025, `github.com/apple/containerization`) layers OCI semantics on it: the `container` CLI boots each container as an isolated lightweight Linux VM with a minimal kernel and vminitd, optimized for sub-second start. This matches our `SandboxProvider` contract almost one-to-one, and the Docker provider (`add-docker-local-provider`) already establishes the subprocess-CLI provider pattern and the shared trial image.

## Goals / Non-Goals

**Goals:**
- Per-trial VM isolation locally with the same pinned trial image and the same provider interface.
- Strict preflight so non-Apple-Silicon or missing-CLI hosts fail clearly before any spend.

**Non-Goals:**
- A custom Swift VM manager on raw Virtualization.framework (kernel/initrd plumbing, guest agent, file sync — months of work the `container` CLI already does).
- Intel Mac or Linux/Windows support.
- Replacing Docker as the documented local default (both remain; macos-vz is the Docker-Desktop-free alternative).

## Decisions

- **D1 — `container` CLI via subprocess**, mirroring the Docker provider verb-for-verb: provision = `container run -d --name he-<trial> --memory <limit> --cpus <limit> <image> sleep infinity`; exec = `container exec -w <cwd> -e K=V he-<trial> bash -lc <cmd>`; file in/out via the CLI's copy verb (or `exec` + stdin/base64 fallback if copy semantics differ); destroy = `container rm -f`. Session output stays file-based (daemon-pipe lesson).
- **D2 — Shared image, built by the same Dockerfile** (`infra/trial-image/Dockerfile`); `container build` or `container images pull` from a local registry tag — whichever the CLI version supports — documented in `infra/`. Image tag recorded as provenance `snapshotId`.
- **D3 — Preflight**: `uname -sm` = `Darwin arm64`; `container --version` ≥ pinned minimum; `container system status` (services running); image present, else emit exact build command. Any miss → fail before dispatch.
- **D4 — Provider factory shares an abstract "CLI container provider" base** with the Docker provider (same verbs, different binary and flag table), so behavior divergence between the two stays in one diff-able table rather than two implementations.

## Risks / Trade-offs

- [CLI immaturity/flag churn (macOS 26-era tooling)] → pinned minimum version at preflight; flag table isolated in D4's per-binary config; CI canary task when the CLI updates.
- [Per-VM memory reservation less elastic than Docker's cgroup limits (VM RAM is committed)] → preflight warns when memory × concurrency approaches host RAM; default local concurrency 2.
- [Copy verb semantics may differ from `docker cp`] → copyOut falls back to in-VM tar + exec-stream read if needed (already proven in the Daytona provider).
- [Networking model differences (per-VM NAT) affecting mock-tracker reachability during grading] → grading runs on the host against archived workspaces, not inside trial VMs — unaffected; only builds run in VMs.

## Open Questions

- Minimum macOS/CLI version to pin (depends on the user's OS at implementation time).
- Whether `container` supports an OCI image load from `docker save` output directly (would let one local build serve both providers without a registry).
