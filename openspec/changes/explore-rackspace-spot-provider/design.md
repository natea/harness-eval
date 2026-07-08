## Context

The `SandboxProvider` contract (`provision → exec/writeFile/copyOut → destroy`, plus
`preflight`) abstracts isolation; today each backend (daytona, e2b, docker, macos-vz,
worktree) is a bespoke TS integration, and our drivers shell out to CLIs (`claude -p`,
`codex exec`) inside the sandbox — so any backend just needs to run shell commands,
move files, and inject env. Our cloud ceiling is real: e2b Hobby caps sandbox lifetime
at 1h, and Daytona free tier's 10GiB total forces cloud concurrency 1. Rackspace Spot
sells surplus capacity as managed Kubernetes CloudSpaces at an auction floor of
$0.001/hr per node, with a conversational MCP server for provisioning. The draw is
cheap, genuinely-parallel cloud compute for matrix runs; the cost is Kubernetes
indirection and a preemptible node model that fights our trial-completion invariant.
Jed Arden's DevPod guide is the ground-truth bootstrap: Calico node-IP autodetection
patch, an authenticated Docker Hub pull secret (shared-NAT anonymous pulls get
rate-limited), a long-lived ServiceAccount token (the OIDC token expires in ~3 days),
and storage-class/PVC gotchas (volumes cannot be resized; `storageClassName=sata`
required).

## Goals / Non-Goals

**Goals:** determine if Rackspace Spot can back a `SandboxProvider`, whether the
spot/preemption model survives our fairness-and-trial-completion invariants, what a
non-interactive control plane looks like, and the $/parallelism payoff vs. e2b/daytona;
end with go/no-go.

**Non-Goals:** replacing existing providers; a production multi-region autoscaling
build; standing up long-lived DevPod dev environments (the guide's use case) instead
of ephemeral per-trial sandboxes; making the interactive MCP server a dependency of
headless matrix runs. Throwaway spike only.

## Decisions

**1. Sandbox unit = a per-trial pod in a pre-provisioned Spot CloudSpace (VM as
fallback).** The operator stands up one CloudSpace + node pool once; each trial is a
pod scheduled onto it, which matches the "many cheap parallel sandboxes" goal and
reuses the guide's k8s bootstrap. Alternative — a Spot VM per trial — is simpler to map
to the exec/copyOut contract but slower to provision and coarser-grained; keep it as a
fallback if pod-level isolation/secret-scoping proves awkward.

**2. Control plane is `kubectl` against a pre-provisioned CloudSpace with a long-lived
ServiceAccount token; MCP is operator-only.** A headless matrix run cannot block on
interactive OAuth, which is how the MCP server authenticates on first call. So the
adapter provisions/execs pods via the k8s API (long-lived ServiceAccount token per the
guide), and the MCP server is used only by an operator to price-shop and create the
CloudSpace once. Alternatives considered: the Spot REST API directly (viable if it
issues non-interactive tokens — evaluate in the spike); driving the MCP server headless
(rejected as the run's hot path — OAuth + conversational surface is wrong for a loop).

**3. Trials run on an on-demand node pool (or a high-percentile bid); spot is opt-in
and always recorded.** Preemption mid-trial voids a trial, which collides with the
trial-completion invariant. Default trials to an on-demand pool for correctness;
expose a spot pool with a p80+ bid as an explicit, provenance-recorded opt-in, with
detect-and-reschedule on preemption. Cost measurement compares both so the spot upside
is quantified honestly.

**4. Reuse per-sandbox secret-injection discipline; extend archiver redaction.** Worker
auth is injected into each pod at provision (env/secret scoped to the pod), never baked
into an image or PVC. Kubeconfigs and ServiceAccount tokens are new secret shapes — add
their patterns to `src/driver/archive.ts` before any capture runs.

**5. Drivers must run inside Spot pods.** Confirm `claude-code` / `codex` CLIs and the
file-redirect output-capture pattern work under the pod (Bun + toolchains in the trial
image); the daemon-stdout footgun still applies, so the file-redirect rule must hold,
and the trial image needs the authenticated Docker Hub pull secret to avoid init-time
rate limits.

## Risks / Trade-offs

- **Preemption voids trials** → default trials to on-demand/high-bid pools;
  detect-and-reschedule; always record node type + bid in provenance so a run's
  fairness is auditable.
- **Kubernetes indirection + bootstrap fragility** (Calico patch, Docker Hub PAT,
  storage class) → spike the guide's exact bootstrap first; if standing up a working
  CloudSpace is flaky, that weighs against adoption regardless of price.
- **Interactive-OAuth-only control plane** → pin `kubectl` + long-lived ServiceAccount
  token as the headless path; treat MCP as operator convenience, not run dependency.
- **Docker Hub rate limits on fresh nodes** → bake/pull the trial image via an
  authenticated secret; measure cold-node init time as part of provisioning cost.
- **Non-resizable, persistent PVCs** → size generously up front; verify teardown
  reclaims PVCs so preempted/rescheduled trials don't leak volumes.
- **Overlap with existing providers** → only worth adopting if the cost/parallelism win
  clearly beats e2b/daytona net of k8s overhead; otherwise no-go.

## Migration Plan

Spike is throwaway and additive — no migration. If go: land a real
`rackspace-spot` provider behind the unchanged `SandboxProvider` contract, gated by a
preflight (CloudSpace reachable, ServiceAccount token valid, pull secret present) so
`run` refuses cleanly when the account/cluster isn't ready — same shape as the e2b/
daytona preflights. Rollback is deletion of the provider; no other backend changes.

## Open Questions

- Does the Spot REST API issue non-interactive tokens (a simpler control plane than
  kubectl-on-CloudSpace), or is `kubectl` + ServiceAccount token the only headless path?
- Pod-per-trial vs. VM-per-trial: which gives clean secret scoping + fast provisioning
  + a faithful exec/copyOut mapping?
- Real preemption frequency at p80 in cheap regions (IAD/ORD), and whether
  detect-and-reschedule is cheaper overall than defaulting to an on-demand pool.
- Cold-node provisioning + Docker-Hub-authenticated image-pull time vs. e2b/daytona
  warm-start, for a representative 4×3 matrix.
- Can a pinned trial image (Bun + Claude Code + Codex + toolchains) be pulled reliably
  into a Spot pod without hitting NAT-shared rate limits?
