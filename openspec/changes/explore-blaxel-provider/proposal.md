# Explore: Blaxel as a Sandbox Provider

## Why

The harness runs each trial in an isolated sandbox behind one `SandboxProvider`
interface (today: daytona, e2b, docker, macos-vz, worktree; with Modal/Runloop in
flight). [**Blaxel**](https://blaxel.ai/) is worth assessing as another: it runs
**microVMs that boot in milliseconds and resume from a snapshot in ~25ms**, with
sandbox-local snapshots, programmable networking (static IPs, egress control,
secret injection), and **per-second pricing** ($200 free credits, no card).

Two things make it a strong fit:

1. **Its SDK maps almost 1:1 onto our interface.** `SandboxInstance.create({ image })`
   → `provision`, `sandbox.fs.write` → `writeFile`, `sandbox.process.exec({ command,
   waitForCompletion })` → `exec`, destroy → `destroy`. A `BlaxelProvider` looks like
   a thin adapter.
2. **Warm resume could fix our slowest pain point.** Daytona's free tier throttled
   us into concurrency-1 with slow provisioning and reclaimed sandboxes mid-build.
   Blaxel's ~25ms snapshot resume + per-second cost suggests a **warm pool** of
   pre-provisioned trial sandboxes — near-instant provisioning instead of multi-minute
   waits.

## What to explore

1. **A `BlaxelProvider` implementing `SandboxProvider`** — provision / writeFile /
   exec / destroy via the TS SDK; `BLAXEL_API_KEY` auth; secret injection for the
   worker auth token.
2. **The trial-image story.** We bake `harness-eval-trial` (bun, Claude Code,
   zeroclaw + ACP client, etc.). Blaxel runs from images/snapshots — assess building
   and pushing our toolchain image to Blaxel, and wiring it into the new
   `resolveProviderSnapshot` / `requiredProbe` preflight so a stale image fails before
   spend.
3. **Port exposure for live demos.** Blaxel's programmable networking / static IPs
   could back the `artifact-preview` demo router (a public-ish URL for a built app),
   unlike the local-only `port` router.
4. **Measured comparison.** Provisioning latency (cold + warm-resume), per-trial
   cost, and concurrency headroom vs daytona/e2b on the same target.

## Out of scope (until the exploration recommends it)

Committing to Blaxel, building the production provider, or a warm-pool scheduler.
This change produces a feasibility assessment + a go/no-go with a measured
comparison, not an implementation.

## Impact

- New (exploratory) spec: `blaxel-provider`.
- Touches (later, if adopted): `src/providers/` (a `BlaxelProvider` + factory wiring),
  the trial-image build, and optionally the `artifact-preview` preview router.
- Isolation/fairness preserved by construction: microVM per trial, root filesystem
  wiped on destroy, single injected worker credential — the same invariants every
  provider honors.
