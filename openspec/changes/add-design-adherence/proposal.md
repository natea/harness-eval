# Proposal: Design-System Adherence Evaluation

## Why

The harness grades **functional** PRD adherence and code quality, but not
whether a framework follows a **design system** — and for any UI/web product,
"does it match the intended look and feel" is a first-class question. Frameworks
likely differ sharply here: some faithfully thread brand tokens through a theme,
others ignore a design brief and ship generic defaults.

[`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)
is a curated, MIT-licensed catalog of **74 machine-readable `DESIGN.md` token
specs** for popular products (Apple, Linear, Notion, Airbnb, Cursor, Claude,
Stripe-likes, …) — YAML frontmatter with semantic color tokens, a typography
scale, spacing, radius, and component guidance. This is the same agent-readable
design-system format the Eval Studio change adopts (and that Google Stitch /
Claude Design export). It gives us a ready supply of real, varied design systems
to evaluate adherence against.

This change lets an operator **pick a design from the catalog** and attach it to
a UI-producing run, instructs every candidate (identically) to build the PRD's
interface to that design, and scores **how closely each framework's output
matches the chosen design system's tokens** — a new comparison axis alongside
PRD adherence and code quality.

## What Changes

- **Design catalog + selection.** Vendor (or reference) selected `DESIGN.md`
  specs from `awesome-design-md` under `designs/<name>/`, each carrying source
  provenance + the MIT notice (same freeze/attribution discipline as
  ViBench-adapted targets). Runs gain `--design <name>` (optional; most
  meaningful on web/UI targets).
- **Design-injected prompt (fairness-preserving).** When a design is selected,
  the shared base prompt gains an identical instruction block telling every
  candidate to implement the PRD's UI per the chosen `DESIGN.md` tokens
  (colors, typography, spacing, radius). The rule is unchanged: every candidate
  in a run gets the *same* rendered prompt.
- **Design-adherence scoring.** A new 0–100 **design adherence** signal scoring
  how well the built UI's actual tokens match the spec:
  - **v1 (static, no browser):** extract the implementation's realized tokens —
    CSS custom properties, Tailwind theme, and inline/utility styles — and
    compare to the `DESIGN.md` palette + type scale (nearest-color distance,
    font-family/size/weight match), producing a per-category and overall match.
  - **v2 (browser, future):** render the running app and read **computed
    styles** via Playwright, comparing actual rendered colors/fonts to the spec
    (depends on browser-driven evaluation, out of scope for the web-app target's
    HTTP-light v1).
- **Recorded everywhere.** Chosen design (name + provenance, never altered) and
  the adherence score land in provenance, results, and the scorecard.
  Adherence is reported as its own dimension; weighting it into the composite is
  opt-in (not every run carries a design).

## Capabilities

### New Capabilities

- `design-adherence`: A catalog of curated `DESIGN.md` design systems, a
  `--design` selector that injects an identical design instruction into the
  shared prompt, a token-match adherence scorer (static v1; browser v2), and
  provenance/reporting for the chosen design and its score.

## Impact

- New `designs/<name>/` entries (vendored `DESIGN.md` + `source`/MIT notice);
  `designs/NOTICE` preserving the awesome-design-md attribution.
- Base prompt template gains an optional design block; `--design` plumbed
  through orchestration and recorded in provenance/results.
- New static token-adherence scorer in grading; a `designAdherence` dimension in
  results/scorecard, reported separately and opt-in for the composite.
- Most valuable on the `web-app` (UI) target; the browser-based v2 measurement
  depends on adding browser-driven evaluation (tracked separately).
- No change to existing non-design runs; the feature is additive and only
  engages when `--design` is set.
