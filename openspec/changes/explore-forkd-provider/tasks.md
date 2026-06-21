# Tasks: Explore forkd as an Isolation Provider

> Exploratory: investigation + a thin spike + a go/no-go recommendation.
> Hard cap: one host, one real trial, measured against one existing provider.

## 1. Investigation

- [ ] 1.1 Map forkd's model (warm parent → CoW children) onto the
  `SandboxProvider` contract; assess reuse of `src/providers/e2b.ts` given the
  E2B-compatible SDK
- [ ] 1.2 Confirm the secret model: per-child auth injection, no secrets in the
  warm parent snapshot (D2); identify where it differs from E2B
- [ ] 1.3 Identify host requirements + topology options (bare metal / nested-virt
  cloud VM / k8s) and pin a forkd version

## 2. Stand up forkd (spike)

- [ ] 2.1 Bring up the forkd daemon on a Linux + KVM host; preflight checks
  (kernel ≥5.7, `/dev/kvm`, daemon reachable)
- [ ] 2.2 Warm a parent VM from the pinned trial image (Bun, Claude Code,
  toolchains); snapshot/pause it
- [ ] 2.3 Verify fork → exec → writeFile/readFile → teardown via the SDK; check
  non-contamination between two concurrent children (D3)

## 3. Thin provider + one real trial

- [ ] 3.1 Spike `src/providers/forkd.ts` (provider id `forkd`) adapting the
  E2B-compatible SDK; wire host/daemon/snapshot preflight
- [ ] 3.2 Run one real candidate trial end-to-end (build → grade → scorecard)
  through forkd; record provenance (provider, forkd version, warmed image)
- [ ] 3.3 Measure per-trial provision time + cost; run the same trial on
  Daytona or E2B for comparison

## 4. Recommendation

- [ ] 4.1 Feasibility report: SDK-reuse extent, child cleanliness findings,
  measured provisioning win, alpha-maturity + self-host-TCO assessment
- [ ] 4.2 Go/no-go + production shape for a follow-up `add-forkd-provider`
  (managed vs. self-host, version pinning, where forkd beats existing providers);
  note whether forkd's live-branch is worth a later checkpoint/resume look
