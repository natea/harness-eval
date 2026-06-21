# Proposal: Trial Artifact Audit + Live Demos

## Why

Every trial produces a real, runnable deliverable — an app the candidate built
in its sandbox, archived to `runs/<id>/trials/<trial>/workspace/`. Today the only
way to inspect it is to read files on disk or hand-serve it (exactly what we did
by hand to view a built web-app). There's no first-class way to **audit** what a
trial produced or to **see the app actually run**.

We want, per trial:

- an **artifact audit** — a read-only inventory of what was built (file tree,
  the cold-start contract `setup.sh`/`start.sh`, sizes, logs, and the recorded
  grades), without ever mutating the archived workspace; and
- a **live demo** — a clickable link that boots the built app from its archived
  workspace and serves it, so a reviewer can click through the thing the agent
  made instead of just reading its source.

Running each app needs an address. Two strategies: a **port allocator** (each
demo on its own ephemeral port) or **portless** (vercel-labs/portless), which
gives every app a stable `*.localhost` URL through a local HTTPS proxy so we
never juggle ports — friendlier for humans and agents alike.

The catch: a trial's deliverable is **agent-generated code**, and its cold-start
contract runs arbitrary commands. Demoing it must be **isolated by default**, not
executed bare on the reviewer's host.

## What Changes

- **New `artifact-preview` capability.** Boot a completed trial's archived
  deliverable via its cold-start contract, health-check it, and expose a demo
  URL — from a copy, never mutating the archive. Adapts to the target: web/HTTP
  targets get a live URL; non-web targets (CLI, daemon) get a captured cold-start
  run instead.
- **Isolated by default.** Previews execute inside a SandboxProvider (reusing the
  docker/worktree abstraction), not on the bare host. Host execution is an
  explicit, recorded opt-in for trusted local review only.
- **Pluggable preview routing.** `port` (default, zero-dependency ephemeral
  ports) or `portless` (stable `<run>-<trial>.localhost` URLs via the portless
  proxy / `portless alias`). Configurable per environment.
- **Preview lifecycle + limits.** On-demand start, health-checked readiness,
  idle auto-stop, explicit stop, a concurrency cap, and localhost binding — a
  cancelled/idle preview leaks no process or sandbox.
- **Artifact audit surface.** A read-only inventory API + a studio panel listing
  the built files, the cold-start contract, logs, and grades for a trial.
- **Studio integration.** The trial drill-down gains an **Artifacts** audit panel
  and a **Demo** control that starts/stops a preview and links the live URL.

Out of scope: hosting demos on a public/remote URL, persistent always-on demos,
and diffing artifacts across trials (possible follow-ons).

## Related Changes

- **`add-trial-transcript-audit`** is the *process* half of trial inspection
  (replay the build conversation from `trials/<id>/transcripts/*.jsonl`); this
  change is the *output* half (audit the built deliverable + boot it as a live
  demo). They share no data source and no risky surface — this one executes
  agent code under sandbox isolation, that one is a pure read of already-redacted
  text. They DO both extend the studio Trial drill-down (`TrialView.tsx`): this
  adds **Artifacts** + **Demo**, that adds **Conversation**. Whichever lands
  second MUST rebase its `eval-studio` trial-view delta so the drill-down ends
  with one coherent set of sibling tabs (Artifacts / Demo / Conversation), not
  two diverging "trial view" requirement sets.

## Impact

- New spec: `artifact-preview`. Affected spec: `eval-studio` (audit panel + demo
  control on the trial view).
- New code: a preview launcher + pluggable router (`port`/`portless`) + an
  artifact-inventory reader; studio endpoints (start/stop/inventory) and trial-view
  UI. Reuses the SandboxProvider abstraction and the target cold-start contract.
- Safety: previews run isolated by default, bind localhost, and never mutate
  archived artifacts (the runs/ ground-truth invariant holds).
- Builds on `add-studio-live-runs` (shares the studio launch/job patterns); rebase
  onto main once that lands.
