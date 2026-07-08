# Capability: rackspace-spot-provider

## ADDED Requirements

### Requirement: Rackspace Spot as a SandboxProvider
The harness SHALL be able to run a trial through a Rackspace-Spot-backed isolation
provider that implements the `SandboxProvider` contract (provision, write file, exec
with exit code, copy out, teardown), where the sandbox is a per-trial workload on a
Spot CloudSpace (a pod) or a Spot VM. Provenance SHALL record `provider:
rackspace-spot`, the pinned control-plane/tool versions, the region and node/server
class, the bid percentile, and whether the node was spot (preemptible) or on-demand.

#### Scenario: Trial runs through a Spot-backed sandbox
- **WHEN** a run selects the Rackspace Spot provider against a reachable CloudSpace
- **THEN** the trial provisions a sandbox, runs the cold-start contract (`setup.sh`
  then `start.sh`) and a harness session to a terminal state, and provenance records
  `rackspace-spot`, the region/class/bid, and the spot-vs-on-demand node type

### Requirement: Non-interactive control plane
Provisioning for a headless matrix run SHALL NOT depend on interactive OAuth. The
exploration SHALL pin exactly one non-interactive control plane — the Spot REST API,
`kubectl` against a pre-provisioned CloudSpace using a long-lived ServiceAccount
token, or the MCP server with a non-interactive credential — and record the chosen
mechanism and its pinned version. The MCP server MAY be used by an operator to stand
up the CloudSpace once, but SHALL NOT be an interactive dependency of a matrix run.

#### Scenario: Headless run provisions without human OAuth
- **WHEN** a matrix run provisions Spot sandboxes with no operator present
- **THEN** provisioning succeeds using the pinned non-interactive control plane, and
  no step blocks on an interactive OAuth/browser flow

### Requirement: Preemption preserves trial completion and fairness
The provider SHALL define and enforce a preemption policy that keeps results fair: a
trial whose node is preempted mid-run SHALL be voided or rescheduled, never silently
graded on partial work. The policy (high-percentile bid, on-demand node pool for
trials, or detect-and-reschedule) SHALL be recorded in provenance.

#### Scenario: Preempted trial is not graded on partial work
- **WHEN** a Spot node hosting an in-flight trial is preempted before the session
  reaches a terminal state
- **THEN** the trial is marked voided (or rescheduled onto a fresh sandbox) and is
  excluded from grading, and provenance records the preemption

### Requirement: Per-sandbox secret injection
Worker/harness credentials SHALL be injected into each Spot sandbox at provision time
and SHALL NOT be baked into any shared image, template, snapshot, or persistent
volume. The exploration SHALL confirm secrets are scoped to the sandbox and cleaned up
on teardown, and SHALL add any new Spot/kubeconfig/ServiceAccount-token secret
patterns to the archiver's redaction set (`src/driver/archive.ts`).

#### Scenario: Auth scoped to the sandbox and redacted in archives
- **WHEN** a Spot sandbox is provisioned for a trial
- **THEN** the worker credential is present in that sandbox's environment but not in
  any shared image/template/PVC, is gone after teardown, and any kubeconfig or
  ServiceAccount token in captured artifacts is redacted by the archiver

### Requirement: Clean teardown with no leak
Teardown SHALL reclaim every resource the trial created — pod/VM, any per-trial node
pool, and PVCs — leaving no billable residue in the CloudSpace. The exploration SHALL
verify no orphaned volumes remain, given the guide's finding that volumes cannot be
resized and persist across pod restarts.

#### Scenario: No billable residue after teardown
- **WHEN** a Spot-backed trial completes and teardown runs
- **THEN** the trial's pod/VM, per-trial node pool, and PVCs are deleted, and a
  post-teardown check finds no orphaned billable resources for that trial

### Requirement: Measured payoff and go/no-go
The exploration SHALL measure provisioning time (warm cluster vs. cold node) and
concurrent-sandbox throughput on Rackspace Spot, compare $/trial and parallelism
against an existing provider (e2b or daytona) for a representative matrix, and SHALL
conclude with a go/no-go recommendation naming the control plane adoption would use
and the integration cost.

#### Scenario: Evidence-backed recommendation
- **WHEN** the exploration completes
- **THEN** it reports measured provisioning/parallelism/$-per-trial (including the
  Kubernetes and Docker-Hub-rate-limit overhead) alongside a clear adopt /
  do-not-adopt recommendation and the control plane it would use
