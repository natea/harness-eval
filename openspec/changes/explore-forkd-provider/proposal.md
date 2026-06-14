# Proposal: Explore forkd as an Isolation Provider

## Why

Every trial runs in a fresh isolated environment behind one `SandboxProvider`
interface (today: Daytona + worktree on `main`; Docker/E2B/macOS-VZ built on the
`pluggable-providers` branch). Provisioning is the dominant per-trial overhead
and cost: each sandbox cold-boots a kernel/container before the agent does any
work, and a 4-candidate × 3-trial matrix pays that tax 12×.

[`deeplethe/forkd`](https://github.com/deeplethe/forkd) (Apache-2.0) is a
Firecracker microVM runtime whose distinctive feature is **fork-from-warm**:
boot one parent VM with the runtime warmed (image, toolchains, even loaded
processes), pause it, then spawn children that inherit its memory via
copy-on-write — ~**101ms to spawn 100** children, vs. seconds of cold-boot.
Per the upstream comparison, forkd is the **only OSS sandbox runtime offering
fork-from-warm** (Modal has it but is proprietary; E2B/Daytona/Docker/gVisor do
not), with hardware (KVM) isolation and an **E2B-compatible SDK**.

If a parent VM warmed with our pinned trial image (Bun + Claude Code +
toolchains) can fork a clean child per trial in ~100ms, forkd could collapse
provisioning time and cost for matrix runs while keeping microVM-grade
isolation. This change is a **feasibility exploration**: can forkd slot in as a
`SandboxProvider`, what does it actually save, and is the alpha maturity
acceptable — ending in a go/no-go recommendation.

## What Changes

Scoped as **investigation + a thin spike + a recommendation**, not a production
provider:

- **Assess the fit** of forkd's model (warm parent → CoW children) against our
  `SandboxProvider` contract (provision / writeFile / readFile / exec /
  teardown) and our fairness + secret-handling rules. The E2B-compatible SDK
  means the existing `e2b.ts` provider is a starting template.
- **Stand up forkd** on a Linux + KVM host (forkd needs Linux ≥5.7 + KVM — no
  native macOS), warm a parent VM with the pinned trial image, and verify
  fork + exec + file copy + teardown.
- **Spike a thin `forkd` provider** and run **one real trial** end-to-end
  (build + grade + scorecard) through it.
- **Measure** per-trial provision time and cost vs. Daytona/E2B, and whether a
  CoW-forked child is clean enough for a fair trial (own netns, re-seeded
  randomness, no parent-state leakage).
- **Recommend** go/no-go + the production shape (managed host vs. self-host TCO,
  version pinning against alpha API churn, where forkd wins vs. existing
  providers).

## Capabilities

### New Capabilities

- `forkd-provider`: A `SandboxProvider` implementation backed by forkd —
  warm-parent provisioning, CoW-forked per-trial children, preflight for the
  Linux/KVM host, and per-child secret injection — validated by a spike with
  measured provisioning gains. (Full build is a follow-up if the spike says go.)

## Impact

- New provider id `forkd`; a thin `src/providers/forkd.ts` adapting the
  E2B-compatible SDK (reusing `e2b.ts` patterns) plus a host/daemon preflight
  (KVM present, kernel ≥5.7, parent snapshot warmed).
- A documented self-host setup (forkd daemon on a Linux/KVM host or nested-virt
  cloud VM); **not available on macOS** — Apple Silicon keeps macos-vz.
- Worker auth and other secrets are injected **per child fork**, never baked
  into the warm parent snapshot (preserves the env-only secret model).
- Provenance records `provider: forkd` and the warmed-image identity; budget
  caps still apply (forkd's alpha quotas are memory-only today).
- No change to existing providers; forkd is additive and behind the spike until
  a follow-up `add-forkd-provider` lands.
