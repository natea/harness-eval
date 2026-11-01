# Tasks: Explore Rackspace Spot as a sandbox execution provider

> Investigation + thin spike + recommendation. No production provider until go.

## 1. Investigation
- [ ] 1.1 Read the Spot MCP tool surface + REST API + CloudSpace/k8s model; map each
  `SandboxProvider` method (provision, exec→exit-code, writeFile, copyOut, destroy,
  preflight) to a concrete Spot operation (pod-per-trial vs. VM-per-trial). Note gaps.
- [ ] 1.2 Determine the non-interactive control plane: does the Spot REST API issue
  headless tokens, or is `kubectl` + a long-lived ServiceAccount token (per the guide)
  the only OAuth-free path? Pin one; note the MCP server as operator-only.
- [ ] 1.3 Confirm our `claude-code` / `codex` CLIs + the file-redirect output capture
  run inside a Spot pod (Bun + toolchains), including the authenticated Docker Hub pull
  secret so image pulls don't rate-limit.

## 2. Bootstrap a Spot CloudSpace (operator, one-time)
- [ ] 2.1 Create account/org + CloudSpace in a cheap region (IAD/ORD); add a node pool.
  Use the MCP server to price-shop and provision the cluster once.
- [ ] 2.2 Apply the guide's bootstrap: Calico node-IP autodetection patch, Docker Hub
  PAT pull secret, long-lived ServiceAccount token (`--duration=8760h`), `sata`
  storage class. Capture a working kubeconfig for the spike.

## 3. Thin spike (single trial, minimize spend)
- [ ] 3.1 A throwaway `SandboxProvider` adapter that provisions a per-trial pod via
  kubectl/k8s API and drives it (exec, file in/out, copyOut, teardown).
- [ ] 3.2 Run one trial end-to-end: provision → cold-start contract (`setup.sh` then
  `start.sh`) → harness session → telemetry → teardown with no leaked pod/pool/PVC.
- [ ] 3.3 Verify per-sandbox secret injection (worker auth scoped to the pod, gone
  after teardown; nothing baked into image/PVC) and add Spot/kubeconfig/ServiceAccount
  token patterns to the archiver redaction set (`src/driver/archive.ts`).
- [ ] 3.4 Exercise the preemption policy: run a trial on a spot pool, force/observe a
  preemption, and confirm the trial is voided/rescheduled (never graded on partial
  work) with the node type + bid recorded in provenance.

## 4. Measure + recommend
- [ ] 4.1 Provisioning time (warm cluster vs. cold node incl. image pull) + concurrent
  pod throughput; $/trial vs. e2b/daytona for a representative matrix.
- [ ] 4.2 Assess spot vs. on-demand: preemption frequency at p80 in IAD/ORD, and
  whether detect-and-reschedule beats defaulting trials to an on-demand pool on cost.
- [ ] 4.3 Go/no-go: adopt a `rackspace-spot` provider? which control plane (REST vs.
  kubectl)? spot or on-demand default? full-build cost?
- [ ] 4.4 `openspec validate explore-rackspace-spot-provider --strict`.
