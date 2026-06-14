# Design: forkd Isolation Provider (Exploration)

## Context

Our `SandboxProvider` interface abstracts provision/exec/file-copy/teardown;
adding a provider is mechanical once its SDK maps to those verbs (Daytona, E2B,
Docker, macOS-VZ all follow this). forkd is unusual not in its surface (it has
an E2B-compatible SDK + REST API) but in its **execution model**: instead of
cold-booting each sandbox, you warm one parent VM, pause it, and fork CoW
children. That inverts where time goes — a one-time warm cost, then ~100ms per
child — which is exactly the shape a repeated trial matrix wants.

## Goals / Non-Goals

**Goals:**
- Determine if forkd maps cleanly onto `SandboxProvider` and our fairness/secret
  rules.
- Quantify the provisioning win (time + cost) on a real trial vs. Daytona/E2B.
- Validate that a CoW child is a *fair, clean* trial environment.
- Recommend go/no-go with the production shape and risks.

**Non-Goals:**
- A production-hardened forkd provider (follow-up if the spike says go).
- macOS support (forkd is Linux+KVM only).
- Replacing existing providers — forkd would be one more option.

## Decisions (proposed, validated by the spike)

- **D1 — forkd is a `SandboxProvider`, id `forkd`.** Adapt the E2B-compatible
  SDK; `src/providers/e2b.ts` is the template. provision = fork a child from the
  warm parent; exec/writeFile/readFile via the SDK; teardown = kill the child.
- **D2 — Warm parent = the pinned trial image, no secrets.** Boot the parent
  once with `infra/trial-image` (Node 22, Bun, Claude Code at the pinned
  version) + any toolchains, then snapshot/pause. Secrets (worker OAuth token)
  are injected **per child** at provision, never into the warm snapshot — same
  env-only rule, and it keeps the snapshot shareable/cacheable.
- **D3 — Per-child cleanliness is a fairness requirement, not an assumption.**
  Each child must have its own network namespace, fresh entropy, and no leaked
  in-flight parent state. The spike explicitly checks contamination (two
  children can't see each other's files/processes) before trusting results —
  the same discipline as the existing per-trial isolation contamination tests.
- **D4 — Host/daemon preflight before any run.** Refuse fast if not Linux ≥5.7,
  no `/dev/kvm`, daemon unreachable, or the warm parent snapshot is absent —
  mirroring the other providers' fail-before-spend preflights.
- **D5 — Pin against alpha churn.** forkd is alpha; snapshot formats and API
  shapes may change pre-1.0. Pin a forkd version + record it in provenance;
  treat upstream movement as a deliberate re-pin (same discipline as the trial
  image and plugin pins).
- **D6 — Self-host topology is part of the recommendation.** forkd is a daemon
  on a Linux/KVM host (bare metal, nested-virt cloud VM, or K8s per
  `packaging/k8s/`). The spike runs on one host; the recommendation covers TCO
  vs. managed Daytona/E2B and a laptop-free cloud-orchestrator pattern.

## Risks / Trade-offs

- [Alpha maturity] → no third-party security audit, no CPU/IO/PID quotas yet
  (memory-only cgroup), API may change. Acceptable for an exploration; rely on
  our own budget caps; gate production on maturity. *(Apache-2.0, so no license
  friction — unlike Daytona's AGPL-3.0.)*
- [Linux/KVM only] → no native macOS; on Apple Silicon use macos-vz. forkd is a
  cloud/Linux-host option, overlapping E2B's niche but self-hosted and OSS.
- [Warm-parent staleness/leakage] → if the parent carries process state, a child
  could inherit something unfair; D3's contamination check is the gate. Re-warm
  per run if needed.
- [Self-host operational cost] → standing up + maintaining a KVM host vs. a
  managed API. The provisioning savings must outweigh the ops burden; that's the
  core go/no-go question.
- [Secret in snapshot] → baking auth into the warm parent would leak it to every
  child and into a cached snapshot; D2 forbids it (per-child injection only).

## Open Questions (the exploration answers these)

- Real measured provision time + cost per trial on our image vs. Daytona/E2B —
  does fork-from-warm deliver the advertised ~100ms with Claude Code warmed?
- Is a CoW child genuinely a clean, fair trial environment (D3)?
- Managed-vs-self-host TCO: does the provisioning win justify running KVM infra?
- How much of `e2b.ts` is reusable given the E2B-compatible SDK — thin adapter
  or meaningful divergence?
- Does forkd's **live branch** (fork mid-execution, ~56ms pause) enable
  trial checkpoint/resume worth a later look?

## References

- [`deeplethe/forkd`](https://github.com/deeplethe/forkd) — Apache-2.0, alpha.
  Firecracker + snapshot CoW; fork-from-warm ~101ms (N=100); KVM isolation;
  E2B-compatible Python SDK + TS SDK + REST API + MCP server; Linux ≥5.7 + KVM.
- Upstream positioning ("How forkd compares"): forkd is the **only OSS** runtime
  with fork-from-warm (Modal has it but is proprietary; E2B/Daytona/Docker/gVisor
  do not). Daytona is AGPL-3.0; forkd and E2B are Apache-2.0.
- Maps onto the existing `SandboxProvider` interface and the
  `add-e2b-sandbox-provider` work (E2B-compatible SDK).
