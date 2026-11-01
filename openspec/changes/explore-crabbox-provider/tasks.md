# Tasks: Explore Crabbox as a Sandbox Provider

## 1. CLI adapter spike

- [ ] 1.1 Install/pin the `crabbox` CLI and authenticate (`crabbox login`, bearer token
  from the environment); confirm the token is env-only, never committed
- [ ] 1.2 Prototype a `CrabboxProvider` implementing `SandboxProvider` by shelling out to
  the CLI: `provision` → `crabbox lease`, `writeFile` → staged `crabbox sync` / `run -- tee`,
  `exec` → `crabbox run`, `copyOut` → `crabbox artifacts`/rsync, `destroy` → `crabbox release`
- [ ] 1.3 Add a `crabbox` `ProviderId` + factory wiring behind the spike (not merged to main)

## 2. Isolation & fairness proof (the gate)

- [ ] 2.1 Prove strict fresh-lease-per-trial with no warm reuse (no `warmup`, no shared
  `--id`); verify `release` terminates the machine and leaves no residue for a follow-on trial
- [ ] 2.2 Prove the sync model excludes host secrets — only a minimal staged workspace is
  rsync'd, `.env`/repo secrets never leave the host
- [ ] 2.3 Confirm fairness holds: identical rendered base prompt, one injected worker
  credential over the run env, archive redaction still applied to transcripts

## 3. Setup model & trial image

- [ ] 3.1 Evaluate brokered (coordinator + cloud creds) vs direct-SSH vs delegated modes;
  pick the pragmatic path for the spike (likely direct-SSH to Hetzner) and record what infra
  and credentials it needed
- [ ] 3.2 Make the harness toolchain (bun, Claude Code, zeroclaw + ACP client, Python/uv)
  present on a leased runner — baked cloud image vs cloud-init/Actions-hydration — and wire it
  through `resolveProviderSnapshot` + `preflightProbeForHarness` so a runner missing the
  toolchain fails preflight before spend

## 4. Operational assessment

- [ ] 4.1 Measure lease-to-ready latency (cold) and per-trial cost on a real backend
- [ ] 4.2 Measure concurrency headroom vs daytona/e2b on one target; note whether crabbox's
  spend caps / `crabbox usage` accounting add real cost-governance value

## 5. Decision

- [ ] 5.1 Go/no-go with the isolation proof as the pass/fail gate and the measured comparison
  as the tiebreaker: does crabbox's brokered full-size-VM + spend-cap model win over the
  existing providers, and can it be driven in strict per-trial mode?
- [ ] 5.2 If go: a scoped follow-on to build the production `CrabboxProvider` (CLI dependency,
  chosen setup mode, image/hydration path) with the isolation guarantees enforced in code
