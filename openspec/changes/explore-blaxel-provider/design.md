# Design: Blaxel as a Sandbox Provider

## Context

`SandboxProvider` needs `provision(trialId) → Sandbox` and `preflight?(ctx)`; a
`Sandbox` needs `id`, `workspacePath`, `exec(cmd, opts)`, `writeFile(path, content)`,
`destroy()`. Blaxel's TS-first SDK (Python at parity) exposes exactly these shapes.

## SDK → interface mapping

| Our interface | Blaxel SDK |
| --- | --- |
| `provider.provision(trialId)` | `SandboxInstance.create({ name: trialId, image })` |
| `sandbox.writeFile(path, content)` | `sandbox.fs.write(path, content)` |
| `sandbox.exec(cmd, { timeoutMs })` | `sandbox.process.exec({ command: cmd, waitForCompletion: true })` |
| `sandbox.destroy()` | destroy instance (root fs wiped) |
| `provider.snapshotId` | a Blaxel image/snapshot tag |
| `provider.preflight(ctx)` | check `BLAXEL_API_KEY` + run `ctx.requiredProbe` in a throwaway sandbox |

So a `BlaxelProvider` is largely a thin adapter — the work is the *image* and the
*operational* questions, not the interface.

## Decisions / questions to resolve

### 1. Trial image on Blaxel (the real work)

Blaxel runs from images/snapshots (e.g. `blaxel/ts-app:latest`). Our trials need
`harness-eval-trial` (bun, Claude Code, zeroclaw + ACP client, Python, uv…). Assess:
build that image for Blaxel and push it to their registry (or a custom-image flow),
then feed it through the existing `resolveProviderSnapshot` + `preflightProbeForHarness`
so an image missing the toolchain fails before any trial dispatches (the same guard
the zerocode harness already relies on).

### 2. Warm resume → near-instant provisioning

Blaxel's headline is ~25ms snapshot resume and indefinite standby with no cold-start.
The spike should measure cold create vs warm resume, and sketch whether a **warm pool**
(a few pre-provisioned, snapshot-backed sandboxes claimed per trial) is worth it — it
would directly fix the slow-provision / reclaimed-sandbox pain daytona's free tier gave us.

### 3. Isolation, secrets, egress

- **Isolation:** microVM per trial, root fs in memory, wiped on destroy → clean
  per-trial teardown by construction. Verify a destroyed sandbox leaves no residue.
- **Secrets:** inject the single worker auth token via Blaxel secret injection / env,
  never baked into the image; archive redaction still applies to transcripts.
- **Egress:** builds need npm/pip/git, so allow egress during the build; Blaxel's
  programmable egress control could *tighten* this later (a fairness lever), but the
  build phase needs the network.

### 4. Port exposure for `artifact-preview` demos

Blaxel's static IPs / programmable networking could expose a built app's port as a
reachable URL — a third preview router alongside `port` (local) and `portless`,
useful for sharing a demo beyond localhost. Assess feasibility + the trust posture
(it would serve agent-built code on a public-ish URL).

## Risks / trade-offs

- **Vendor image/registry friction** — getting our full toolchain image onto Blaxel
  is the main unknown; the spike must prove it before any provisioning numbers mean
  anything.
- **Public-URL demos run agent code** — port exposure beyond localhost raises the same
  untrusted-code concern `artifact-preview` already gates; keep it opt-in.
- **Another paid vendor** — per-second + $200 free is generous, but it's one more key
  and one more dependency; the go/no-go must show a real latency or cost win over the
  providers we already have.
