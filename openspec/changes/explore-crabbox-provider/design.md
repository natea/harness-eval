# Design: Crabbox as a Sandbox Provider

## Context

`SandboxProvider` needs `provision(trialId) → Sandbox` and `preflight?(ctx)`; a
`Sandbox` needs `id`, `workspacePath`, `exec(cmd, opts)`, `writeFile(path, content)`,
`copyOut(sandboxPath, hostDest)`, and `destroy()`. Every existing provider satisfies this
against an *SDK or local daemon*. Crabbox is different: there is **no SDK** — the interface
is a Go CLI (`crabbox login/lease/sync/run/ssh/artifacts/release/usage`) that leases a
brokered cloud VM, rsyncs local files, execs over SSH, and releases. So a `CrabboxProvider`
is a **CLI-shelling adapter**, and the interesting work is the isolation proof, the setup
model, and the image story — not the interface.

## CLI → interface mapping

| Our interface | Crabbox CLI |
| --- | --- |
| `provider.provision(trialId)` | `crabbox lease` (fresh box, capture id/SSH target) |
| `sandbox.writeFile(path, content)` | stage into a workspace dir → `crabbox sync`, or `crabbox run -- tee path` |
| `sandbox.exec(cmd, { timeoutMs })` | `crabbox run --id <box> -- <cmd>` (stdout/stderr streamed back) |
| `sandbox.copyOut(path, hostDest)` | `crabbox artifacts collect` / rsync pull |
| `sandbox.destroy()` | `crabbox release` (must actually terminate the box) |
| `provider.snapshotId` | a cloud image tag or a cloud-init/hydration profile |
| `provider.preflight(ctx)` | check bearer token + `crabbox` binary + run `ctx.requiredProbe` on a throwaway lease |

The mechanical adapter is easy. The design decisions below are where the risk lives.

## Decisions / questions to resolve

### 1. Isolation & fairness in strict mode (the gate)

Crabbox is explicitly *"not a hostile multi-tenant sandbox"* and *"does not automatically
sanitize secrets,"* and its performance story leans on **warm box reuse** (`--id`,
`crabbox warmup`). Our invariants are the opposite. The provider MUST therefore:

- **Lease fresh per trial and release per trial** — never `warmup`, never reuse an `--id`
  across trials. Verify `release` terminates the underlying machine (not just unclaims it)
  so nothing a trial installs survives.
- **Never sync secrets.** Crabbox syncs *tracked, non-ignored* local files by rsync. The
  harness must sync only a staged, minimal workspace dir (spec + harness files), never the
  repo with `.env`. Prefer `run -- tee` / a scoped sync root over syncing the working tree.
- **Inject one worker credential**, over the SSH env for the run, never baked into an image
  or written into synced files; existing archive redaction still applies to transcripts.

This is pass/fail: if a released box can be shown to retain state, or the sync model can't
exclude secrets cleanly, crabbox is a no-go regardless of its latency or cost.

### 2. Coordinator vs direct-SSH setup

Crabbox has three modes. For an eval harness, weigh:

- **Brokered** — a coordinator (Cloudflare Worker + Durable Objects, *or* Node + Postgres)
  provisions/tracks leases and enforces TTL + spend caps. Powerful (usage accounting, caps)
  but it's real infra to stand up plus cloud provider creds held by the Worker.
- **Direct-SSH** — CLI manages leases with no coordinator; simplest to spike, but the CLI
  holds provider creds locally and there's no central spend cap.
- **Delegated** — a sandbox provider (e2b/daytona) does sync+exec end to end; this largely
  duplicates providers we already have, so it's the least interesting for us.

Recommendation to validate in the spike: **direct-SSH to one cheap backend (Hetzner)** for
feasibility numbers, and only assess the coordinator if the numbers justify a production
provider.

### 3. Trial image / hydration

Crabbox runners are vanilla Ubuntu prepared by cloud-init; our trials need the full
`harness-eval-trial` toolchain (bun, Claude Code, zeroclaw + ACP client, Python, uv). Two
paths: (a) **bake a cloud image** per backend carrying the toolchain (fast lease-to-ready,
per-provider image maintenance), or (b) a **cloud-init / Actions-hydration** step that
installs the toolchain on each lease (no image maintenance, slower and network-dependent
per lease). Whichever we pick feeds the existing `resolveProviderSnapshot` +
`preflightProbeForHarness` guard so a runner missing zeroclaw/the ACP client fails
preflight before any build spend.

### 4. Measured comparison

Report lease-to-ready latency (cold; warm only if strict-mode ever admits it), per-trial
cost on a real backend, and concurrency headroom vs daytona/e2b on one target — so the
go/no-go is evidence-based. Crabbox's angle is *full-size cheap VMs + central spend caps*,
not sub-second microVM resume, so the comparison should weigh cost/heavy-build-throughput,
not just cold-start.

## Risks / trade-offs

- **Isolation is not free here.** Unlike the microVM providers, per-trial cleanliness is a
  property we must *establish and verify*, against a tool whose defaults (warm reuse, no
  secret sanitization) point the other way. This is the main reason the exploration might
  end no-go.
- **Setup weight.** Brokered mode is a coordinator + cloud creds; even direct-SSH needs a
  cloud account and image/hydration plumbing — heavier than dropping in an API key.
- **CLI dependency, not a library.** Shelling out to a Go binary (parsing its output,
  handling lease lifecycle/timeouts) is more brittle than an SDK; version pinning the
  `crabbox` CLI matters.
- **Overlap with existing providers.** In delegated mode crabbox just wraps e2b/daytona; the
  win has to come from brokered full-size VMs + spend governance, or it's not worth another
  dependency.
