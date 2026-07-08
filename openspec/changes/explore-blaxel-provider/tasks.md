# Tasks: Explore Blaxel as a Sandbox Provider

## 1. Adapter spike

- [ ] 1.1 Prototype a `BlaxelProvider` implementing `SandboxProvider` via the TS SDK:
  `provision` → `SandboxInstance.create`, `writeFile` → `fs.write`, `exec` →
  `process.exec`, `destroy`; `BLAXEL_API_KEY` auth
- [ ] 1.2 Inject the single worker auth token via Blaxel secret injection / env
  (never baked into the image)

## 2. Trial image

- [ ] 2.1 Build/push a Blaxel image (or custom-image flow) carrying the trial
  toolchain (bun, Claude Code, zeroclaw + ACP client, Python/uv)
- [ ] 2.2 Wire it through `resolveProviderSnapshot` + `preflightProbeForHarness` so a
  stale/incomplete image fails preflight before spend

## 3. Operational assessment

- [ ] 3.1 Measure cold-create vs warm snapshot-resume latency; sketch whether a warm
  pool is worth building (vs daytona's slow provisioning)
- [ ] 3.2 Verify per-trial isolation + clean teardown: a destroyed microVM leaves no
  residue; successive trials share no state
- [ ] 3.3 Measure per-trial cost and concurrency headroom vs daytona/e2b on one target

## 4. Port exposure (artifact-preview)

- [ ] 4.1 Assess exposing a built app's port via Blaxel static IP / programmable
  networking as a `blaxel` preview router; define the trust posture (opt-in, serves
  agent-built code on a public-ish URL)

## 5. Decision

- [ ] 5.1 Go/no-go with the measured comparison: does Blaxel win on provisioning
  latency or cost over the existing providers, and is the image story tractable?
- [ ] 5.2 If go: a scoped follow-on to build the production `BlaxelProvider` (+ optional
  warm pool / preview router)
