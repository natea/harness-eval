# Design: Design-System Adherence Evaluation

## Context

The eval holds the task fixed and varies the agent; targets bundle a PRD + test
plan + fixtures. A `DESIGN.md` token spec (semantic colors, type scale, spacing,
radius) is orthogonal to *what* gets built (the PRD) — it constrains *how it
looks*. `awesome-design-md` supplies 74 real, machine-readable design systems.
The same `DESIGN.md` format is already the token source-of-truth in the Eval
Studio change, so the catalog and the studio's theming share one representation.

## Goals / Non-Goals

**Goals:**
- Let an operator attach a chosen design system to a UI-producing run and
  measure each framework's fidelity to it.
- Keep fairness intact: identical design instruction across candidates.
- Ship a useful **static** adherence score with no browser dependency; leave a
  clean seam for a browser-based v2.
- Preserve attribution for vendored `DESIGN.md` files (MIT).

**Non-Goals:**
- Subjective "is it beautiful" judging — adherence is token fidelity to a
  declared spec, not aesthetic quality.
- Browser/visual measurement in v1 (depends on browser-driven evaluation).
- Forcing design adherence into the default composite (most runs have no design).

## Decisions

- **D1 — Design is an optional, orthogonal run modifier (`--design <name>`)**,
  not a target property: the same PRD can be evaluated against different design
  systems, and the same design across PRDs. Most meaningful on web/UI targets;
  a no-op warning if the target produces no UI.
- **D2 — Catalog with provenance.** Vendor selected specs under
  `designs/<name>/DESIGN.md` with a `source` block (upstream
  `awesome-design-md`, repo, commit, original dir, license `MIT`) and a
  top-level `designs/NOTICE` — same attribution machinery as ViBench-adapted
  targets. Specs are frozen + hashed; drift fails loudly.
- **D3 — Fairness via the shared prompt.** The design instruction is rendered
  into the *single* base prompt every candidate receives (a `{{DESIGN}}` slot),
  pointing at the in-workspace `DESIGN.md` and summarizing the token contract.
  No per-candidate variation.
- **D4 — Adherence = token match, computed two ways.**
  - *v1 static:* parse the produced implementation for realized tokens — CSS
    custom properties (`--color-*`, `--font-*`), a Tailwind theme/config, and
    inline/utility color+font usage — and compare to the `DESIGN.md` palette and
    type scale. Colors match by nearest-distance in a perceptual space (ΔE) under
    a threshold; typography by family/size/weight. Report per-category
    (color, type, spacing, radius) and an overall 0–100.
  - *v2 browser (future):* boot the app, read **computed styles** of key
    elements via Playwright, compare rendered values to the spec. Higher
    fidelity (catches "declared but unused" tokens) but needs browser eval.
- **D5 — Reported as its own dimension, opt-in to the composite.** Results gain
  a `designAdherence` 0–100 dimension recorded whenever `--design` is set;
  including it in the weighted composite is an explicit weight choice, since
  design-less runs have nothing to score.
- **D6 — Within-run cross-framework ranking is the point.** A run fixes
  (PRD, design); ranking candidates by adherence to *that* design is valid and
  is exactly the question this change answers.

## Risks / Trade-offs

- [Static measurement misses runtime reality] → v1 scores *declared* tokens
  (CSS vars / theme / utilities); a framework could declare the palette but
  render off-spec. Flag v1 as "declared-token adherence"; v2 closes the gap.
- [Theming-approach diversity] → frameworks express themes differently (CSS
  vars vs Tailwind vs CSS-in-JS). The extractor must cover the common shapes;
  unknown shapes score low and are flagged, not silently zeroed.
- [Partial credit + thresholds] → color ΔE threshold and "how many of the
  spec's tokens must appear" need tuning; start lenient, record the raw matches
  as evidence (same evidence-or-it-didn't-happen rule as PRD adherence).
- [Design only matters for UI targets] → `--design` warns/no-ops on non-UI
  targets; the catalog and scorer ship regardless.
- [Attribution drift] → `source` block + `designs/NOTICE`, validated like the
  target `source` rule.

## Open Questions

- Which token categories count toward the score, and their relative weight
  (color usually dominates brand perception)?
- Static-only fidelity vs. waiting for browser v2 — is declared-token adherence
  useful enough to ship alone? (Hypothesis: yes, as a strong directional signal.)
- Do we vendor a starter subset of the 74 designs, or reference the upstream and
  fetch on demand? (Default: vendor a small, varied starter set — e.g. Linear,
  Apple, Notion — with provenance.)
- Should design adherence ever gate (fatal) like cold-start, or always be a
  graded signal? (Default: graded signal, never fatal.)

## References

- [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)
  — MIT, 74 `DESIGN.md` token specs (YAML frontmatter: semantic `colors`,
  `typography` scale, spacing, radius, component notes). Commit at adoption:
  `962e08c`.
- The `DESIGN.md` token-spec format is shared with the Eval Studio change
  (`add-eval-studio-ui`) and the Stitch/Claude Design exports discussed there.
