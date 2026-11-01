## Why

Every trial runs a build in a fresh isolated environment behind one `SandboxProvider`
(today: daytona, e2b, docker, macos-vz, worktree). Matrix throughput and cost are
bounded by how cheaply we can provision many sandboxes in parallel, and our current
cloud backends (e2b Hobby caps lifetime at 1h; Daytona free tier = 10GiB total →
cloud concurrency 1) are the binding constraint on running a real 4×3 matrix without
laptop-network babysitting.

[Rackspace Spot](https://spot.rackspace.com) sells surplus datacenter capacity as
managed Kubernetes clusters priced by open auction, with a floor of **$0.001/hr per
node** (~$0.73/month in less-contested regions like Ashburn/Chicago). It ships an
**[MCP server](https://spot.rackspace.com/docs/en/modelcontextprotocol)** (HTTP,
`https://mcp.spot.rackspace.com/mcp`, ~40 tools: live pricing, CloudSpaces, node
pools, VMs; OAuth on first call) that turns cluster/VM provisioning into API calls
our Bun/TS orchestrator — or the harness operator — can drive. If a Spot-backed
sandbox can host a trial, one integration could give the eval **very cheap,
genuinely-parallel cloud compute** for matrix runs, lifting the e2b/Daytona ceiling.

This change is a **feasibility exploration**: can Rackspace Spot slot behind our
`SandboxProvider` contract, does the spot/preemption model survive our
fairness-and-trial-completion invariants, what does it actually cost/save, and is the
Kubernetes indirection worth it — ending in a go/no-go recommendation. Jed Arden's
[Rackspace Spot + DevPod guide](https://jedarden.com/guides/rackspace-spot-devpod/)
is the reference for the real-world bootstrap (Calico patch, Docker Hub PAT to dodge
NAT rate-limits, long-lived ServiceAccount token, storage-class gotchas).

## What Changes

Scoped as **investigation + a thin spike + a recommendation**, not a production
provider:

- **Map Rackspace Spot to our `SandboxProvider` contract.** Confirm provision →
  run-command (exec with exit code) → write/read file → copy-out → teardown can be
  expressed against a Spot-hosted workload (a per-trial pod in a Spot CloudSpace, or a
  Spot VM), and that our `claude-code` / `codex` CLIs + the file-redirect output
  capture run inside it (Bun + toolchains).
- **Decide the control plane: MCP vs. REST API.** The MCP server is conversational
  and OAuth-gated (great for an operator spinning up the cluster once); a headless
  matrix run needs a non-interactive path. Establish whether provisioning goes through
  the MCP tools, the underlying Spot REST API, or `kubectl` against a pre-created
  CloudSpace with a long-lived ServiceAccount token.
- **Confront preemption vs. the trial-completion invariant.** Spot nodes are
  bid-based and preemptible; a preemption mid-trial voids that trial. Decide the
  policy: bid at a high percentile (p80+), use an on-demand node pool for trials, or
  detect-and-reschedule — and record it in provenance so results stay fair.
- **Thin spike.** Provision one Spot-backed sandbox, run the cold-start contract
  (`setup.sh` then `start.sh`), run a harness session, capture telemetry, tear down
  with no leak (node pool / PVC / CloudSpace fully reclaimed).
- **Measure the payoff.** Provisioning time (cluster warm vs. cold node), concurrent
  sandbox throughput, and $/trial vs. e2b/daytona for a representative matrix,
  including the Kubernetes and Docker-Hub-rate-limit overhead the guide documents.
- **Recommendation.** Go/no-go on adopting a Rackspace-Spot-backed provider, whether
  the control plane is MCP or API/kubectl, and what a full build entails.

## Capabilities

### New Capabilities

- `rackspace-spot-provider`: a `SandboxProvider` backed by Rackspace Spot — a per-trial
  workload on a Spot CloudSpace/VM with provision/exec/file/copy-out/teardown, a defined
  non-interactive control plane (MCP vs. REST/kubectl), per-sandbox secret injection, a
  preemption policy that preserves trial completion + fairness, preflight, and provenance
  recording bid/percentile, node class, region, and whether the node was spot or
  on-demand — validated by a spike with measured provisioning/parallelism/cost. (Full
  build is a follow-up if the spike says go.)

### Modified Capabilities

<!-- None. The SandboxProvider contract is unchanged; this adds a new backend behind it. -->

## Impact

- **Spike code (throwaway-ok):** a `SandboxProvider` adapter that provisions a Spot
  workload and drives it (exec, file in/out, teardown); a preflight for reachability +
  account/CloudSpace readiness; the Calico/networking + Docker-Hub-PAT bootstrap the
  guide requires so image pulls don't rate-limit.
- **Control plane:** a headless run cannot depend on interactive OAuth — pin whether we
  call the Spot REST API, `kubectl` against a pre-provisioned CloudSpace (long-lived
  ServiceAccount token, per the guide), or the MCP server, and record the dependency +
  pinned versions.
- **Invariants:** the `SandboxProvider` contract is unchanged; per-sandbox secret
  injection (worker auth injected at provision, never baked into an image/snapshot/PVC);
  the archiver must redact any new Spot/kubeconfig secret patterns (`src/driver/archive.ts`);
  results across providers stay flagged as not directly comparable; a preempted trial is
  voided/rescheduled, never silently graded.
- **Non-goals:** replacing existing providers; a production multi-region autoscaling build;
  standing up long-lived DevPod dev environments (the guide's use case) rather than
  ephemeral per-trial sandboxes; using the MCP server as an interactive dependency of
  headless matrix runs.
