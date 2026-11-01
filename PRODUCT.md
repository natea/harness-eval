# Product

CodingHarness (repo: harness-eval) ranks agentic coding frameworks by having each build the same frozen PRD with the same harness and model in isolated sandboxes, then grading every artifact with an evidence-based evaluator and a blind code-quality judge.

## Platform

web

## Stack

Bun + `Bun.serve()` HTML imports, React 19, Tailwind v4, shadcn/ui primitives (Radix), lucide icons. Studio lives in `src/studio/`; a static mirror publishes to codingharness.xyz from `pages/`.

## Users

- **Operator** (primary, confirmed): the person running evaluations — picks target × frameworks × harness × model × provider, watches live builds across sandboxes, audits trials, regrades, re-weights. Spends real subscription money on every launch.
- **Viewer** (confirmed): people reading results — the leaderboard, tournament bracket, trends — on the public demo site or a shared link. They will never read a rubric.

## Product Purpose

Answer "which framework/harness/model builds this spec best" with a ranking that survives scrutiny: every number traces back to a cited evidence step, a judge justification, or a telemetry record.

## Positioning

Evidence-first benchmark, not a vibes leaderboard. Fairness invariants (identical base prompt, frozen PRD/test-plan hashes, judge ≠ worker, workspace-blind judging) are the product's credibility.

## Operating Context

Desk use on a laptop/large monitor during long runs (minutes to hours); also projected or screenshotted for demos. Light and dark are both required (theme toggle shipped).

## Capabilities and Constraints

Built: runs list + durable run state (running/completed/error/cancelled/interrupted), leaderboard with live re-weighting (4 dims: PRD adherence, code quality, speed*, token spend*; * = within-run normalized), inconclusive flag, per-run scorecard, trial drill-down (step evidence, judge criteria ×3 samples, telemetry, transcript, live SSE stream, file inventory, app preview), configure + cost preflight + confirm, cancel/regrade, inverse-scaling (baseline→framework deltas with trial drill-through), bracket bakeoff (goals = pass +1 / fail −1 / partial credit, penalty shootout).
Landing soon: replay player (play/scrub/chapters/collapsible tool calls/export), concurrent multi-sandbox live replay, compression-tool registry as a Configure axis, language-effectiveness axis, more harnesses (codex, zerocode, gemini, cursor, goose, openhands…).

## Brand Commitments

Name "CodingHarness"; existing logo mark. Monospace for every machine value (ids, hashes, $, tokens, model ids).
Standing preference (user-chosen 2026-11-01): the Studio follows the modern eval-dashboard canon (sidebar, page header, chart + table) at the craft level of Braintrust, Linear and Vercel. Run detail is the exception: it is a trace waterfall (trials as traces, setup and build sessions as timed spans, grading as untimed evidence).

## Evidence on Hand

`pages/demo/data/*.json` — real results (e.g. superpowers 84.21 adherence / 32 quality; gsd 78.25 / 60; agent-skills 85.26 / 54; compound-engineering 75.79 / 60, Symphony daemon, Opus 4.6).

## Product Principles

1. Every score is one click from its evidence.
2. Spend is never a surprise: cost preflight before launch, cost-so-far while running.
3. Within-run-normalized numbers are always marked as such; inconclusive rankings are never presented as wins.

## Accessibility & Inclusion

WCAG AA contrast in both themes; status never conveyed by color alone; keyboard-operable controls.
