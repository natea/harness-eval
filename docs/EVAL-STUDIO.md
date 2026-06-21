# Eval Studio

A local web UI for **configuring** and **reviewing** harness-eval runs, built on
[shadcn/ui](https://ui.shadcn.com) with a dark theme derived from a single token
source-of-truth (`src/studio/DESIGN.md`). It supersedes the read-only dashboard
and is the front end the hosted-evals roadmap builds on.

```sh
bun run studio            # http://127.0.0.1:4871 (localhost-only)
bun run studio --port N
```

## Review

The leaderboard, run scorecards, and trial drill-downs — at parity with the
classic dashboard, on shadcn components — reusing the **same scoring module the
CLI uses**, so client-side re-weighting and composites are identical to
`report --weights`.

![Eval Studio leaderboard: candidate frameworks ranked by weighted composite with
re-weight sliders and dimension bars, over a runs table tagged by app/PRD](studio-leaderboard.png)

- **Leaderboard** — cross-run, aggregated by candidate/harness/worker-model, with
  re-weight sliders (live), dimension data bars, info-tooltips per column, and a
  mixed-candidate-set caveat.
- **Run scorecard** (`/runs/:id`) — per-candidate composite + dimensions + ±σ,
  the trials table, a step-comparison matrix (✅ / 🟡 partial-credit / ❌ with
  evidence on hover), exclusions (with the reason), and provenance hashes.

  ![Eval Studio run scorecard: per-candidate composite and dimension bars, trials
  table, step-by-step adherence comparison, excluded trials with reasons, and
  provenance](studio-run-scorecard.png)

- **Trial drill-down** (`/runs/:id/trials/:id`) — provenance + telemetry, the
  PRD-adherence step results with cited evidence and `↳ trace` links, the blind
  judge's per-criterion samples + justifications, the real-integration tier, and a
  non-completed trial's failure reason.

  ![Eval Studio trial drill-down: PRD adherence steps with pass/partial/fail and
  trace links, blind code-quality criteria with samples, and telemetry](studio-trial.png)

- **Conversation replay** — the trial's full build transcript (request/response,
  thinking, tool calls), with session jumps, an **error navigator** that steps
  through the run's errors one at a time, and an outline trace to where a step
  went wrong.

  ![Eval Studio conversation viewer: request/response build replay with session
  jumps, an error navigator, and an outline trace](studio-conversation.png)

## Configure

Build a run from the **live registries** (targets, frameworks, harness, model
profiles, providers). Validation **mirrors the CLI exactly** — the studio uses
the same `RunConfig.parse` + registry resolution, so a rejection in the studio is
a rejection on the command line (e.g. a framework with no section for the chosen
harness is unselectable, with the reason shown). It computes a budget envelope
and offers three launch modes: a **real run**, a zero-spend **dry run**, or the
**equivalent CLI command** to copy and run.

![Eval Studio configure: registry-driven selects, framework multi-select,
re-weight sliders, budget envelope, and the copyable CLI command](studio-configure.png)

## Launching real runs

A **dry run** (worktree + a fake build) executes immediately with zero spend — it
exercises the launch → status → review chain.

A **real run** bills your subscription, so it must clear four gates before any
sandbox is provisioned: a valid request, **launch authorization** (`canLaunch`),
an acknowledged **budget confirmation** dialog (provider, trial matrix, USD +
wall-clock caps), and the resolved caps the orchestrator enforces during the run.
Real runs execute as **local background jobs**; the **Runs** view shows live
per-trial status, the current **stage** (provisioning → installing → building →
grading), and cost-so-far. **Cancel** tears down the in-flight sandbox so a stuck
trial stops immediately (it doesn't wait for the wall-clock budget). A
non-completed trial's failure reason is surfaced on its drill-down.

![Eval Studio runs view: launched runs with live status, stage, cost-so-far and
cancel, alongside historical runs from disk](studio-runs.png)

**Concurrency** is selectable and defaults per provider — **1 on daytona** (its
free tier is ~10 GiB / effectively concurrency-1, so a higher value gets sandboxes
reclaimed mid-build), **2** elsewhere.

- **Operator token (optional):** set `STUDIO_OPERATOR_TOKEN` to require a token
  with each real launch. Unset, any localhost caller is the single operator. This
  is a minimal guard, **not** an identity or billing system.
- **Authorization seam:** every real launch passes through one `canLaunch(principal,
  request)` decision resolved in `src/studio/policy.ts`. This is the plug-in point
  for a future credit-ledger / paywall policy (`add-eval-credits`) — it can debit
  on launch and refund on infra-failure via the `onLaunched`/`onSettled` hooks
  without changing the launch path.

The studio still binds to **localhost** by default and writes run artifacts only
through the orchestrator's entry points.

## Theming

The theme is a single mapping from `src/studio/DESIGN.md` (semantic color tokens,
typography, spacing, radius) into `src/studio/index.css` (`:root` CSS variables +
Tailwind v4 `@theme`), which shadcn components consume. Re-theming — or adopting a
`DESIGN.md` exported from a tool like Google Stitch or Claude Design — is a token
edit, not a component rewrite. Tailwind is processed by `bun-plugin-tailwind`
under `Bun.serve` (see `bunfig.toml`); no Vite.
