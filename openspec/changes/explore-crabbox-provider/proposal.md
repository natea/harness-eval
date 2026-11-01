# Explore: Crabbox as a Sandbox Provider

## Why

The harness runs each trial in an isolated sandbox behind one `SandboxProvider`
interface (today: daytona, e2b, docker, macos-vz, worktree; with Blaxel/Modal/Runloop
being assessed). [**Crabbox**](https://crabbox.sh/) is a different shape of thing worth
assessing: it is **not an SDK-backed microVM host** but a **remote execution control
plane** — a Go CLI that *leases* a brokered cloud machine, *syncs* your local files
(rsync), *runs* a command over SSH, streams stdout/stderr back, records evidence, then
*releases* the box. Runners are "vanilla Ubuntu boxes prepared by cloud-init with SSH,
Git, rsync, and `/work/crabbox`".

Two things make it interesting for us — and one thing makes it risky, which is exactly
what the exploration exists to resolve:

1. **It brokers backends we don't otherwise reach.** Crabbox fronts 30+ providers
   (Hetzner, AWS, Azure, GCP, bare-metal, *and* e2b/daytona) behind one lease/run/release
   flow, with TTL-bounded machines, monthly spend caps, and per-user/org/provider usage
   accounting from the broker (`crabbox usage`). That is a control plane over cheap
   full-size VMs (real cores/RAM for heavy builds) plus centralized cost governance — a
   different lever than the per-second microVM vendors.
2. **Its verbs map onto ours, via a CLI adapter, not an SDK.** `lease` → `provision`,
   `sync`/`run -- tee` → `writeFile`/`copyOut`, `run` → `exec`, `release` → `destroy`.
   A `CrabboxProvider` shells out to the CLI rather than calling a library.
3. **Its isolation model is the open question.** Crabbox explicitly says it is *"not a
   hostile multi-tenant sandbox"* and *"does not automatically sanitize secrets,"* and it
   *encourages warm box reuse* (`--id`, `crabbox warmup`) for speed. Our core invariant is
   the opposite: every trial fully isolated, no shared state, one injected credential,
   clean teardown. The exploration must prove crabbox can be driven in a strict
   **fresh-lease-per-trial, release-destroys-the-box** mode before it can be a provider.

## What to explore

1. **A `CrabboxProvider` implementing `SandboxProvider` over the CLI** — `provision` leases
   a fresh box; `writeFile` stages files then `crabbox sync` (or `run -- tee`); `exec` maps
   to `crabbox run`; `copyOut` pulls via `crabbox artifacts`/rsync; `destroy` releases and
   verifies teardown. Auth via `crabbox login` bearer token from the environment.
2. **The isolation/fairness proof (the gating question).** Confirm a strict per-trial
   lease with release actually destroys the machine (no warm reuse, no residue), that no
   local secrets leak into rsync'd files, and that fairness holds — identical base prompt,
   one worker credential, no shared state between trials on the same broker.
3. **The setup/coordinator story.** Assess brokered mode (coordinator = Cloudflare Worker +
   Durable Objects, or Node + Postgres, plus cloud provider creds) vs direct-SSH mode (no
   coordinator, CLI holds leases). Weigh whether standing up a coordinator is worth it for
   an eval harness, or whether direct-SSH to one cloud (e.g. Hetzner) is the pragmatic path.
4. **The trial-image story.** We bake `harness-eval-trial` (bun, Claude Code, zeroclaw +
   ACP client, Python/uv). Crabbox runners are vanilla Ubuntu hydrated by cloud-init /
   Actions-hydration per lease. Assess baking a cloud image vs a cloud-init provisioning
   step, and wire whichever through `resolveProviderSnapshot` + `preflightProbeForHarness`
   so a runner missing the toolchain fails before spend.
5. **Measured comparison.** Lease-to-ready latency (cold, and warm via `--id` if we ever
   allow it), per-trial cost on a real backend (e.g. Hetzner), and concurrency headroom vs
   daytona/e2b on the same target.

## Out of scope (until the exploration recommends it)

Committing to Crabbox, standing up a production coordinator, building the production
provider, or using warm-box reuse. This change produces a feasibility assessment and a
go/no-go with a measured comparison — with the isolation proof as the pass/fail gate —
not an implementation.

## Impact

- New (exploratory) spec: `crabbox-provider`.
- Touches (later, if adopted): `src/providers/` (a `CrabboxProvider` + factory wiring and a
  new `ProviderId`), the trial-image/cloud-init build, and the preflight snapshot/probe
  wiring; possibly a bundled `crabbox` CLI dependency and coordinator config.
- Isolation/fairness are *not* preserved by construction here (unlike the microVM
  providers) — they must be established by the exploration: strict fresh-lease-per-trial,
  release-destroys-the-box, one injected credential, no secret-bearing rsync. That proof is
  the central deliverable.
