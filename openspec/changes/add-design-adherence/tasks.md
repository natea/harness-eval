# Tasks: Design-System Adherence Evaluation

## 1. Design catalog

- [x] 1.1 Define the `designs/<name>/` layout + a `DESIGN.md` loader (YAML
  frontmatter: colors, typography, spacing, radius), content-hashed/frozen
- [x] 1.2 Vendor a small, varied starter set from `awesome-design-md` (e.g.
  `linear`, `apple`, `notion`) with a `source` provenance block per design and a
  `designs/NOTICE` preserving the MIT attribution; `validate` enforces both
- [x] 1.3 `--design <name>` selection: load, hash-check, and expose to the run

## 2. Prompt injection

- [x] 2.1 Add a `{{DESIGN}}` slot to the base prompt template; render an
  identical design instruction (token contract + in-workspace `DESIGN.md`
  pointer) for every candidate when a design is selected
- [x] 2.2 Place the chosen `DESIGN.md` into each trial workspace; no-op with a
  recorded warning on non-UI targets

## 3. Static adherence scorer (v1, no browser)

- [x] 3.1 Extract realized tokens from an implementation: CSS custom properties,
  Tailwind theme/config, and inline/utility color+font usage
- [x] 3.2 Compare to the `DESIGN.md` palette (nearest-color ΔE under a tuned
  threshold) and type scale (family/size/weight); produce per-category +
  overall 0–100 with matched/missed tokens as evidence
- [x] 3.3 Surface `designAdherence` in results + scorecard (own dimension,
  opt-in to the composite); record the chosen design + provenance everywhere

## 4. Validation

- [x] 4.1 Unit tests: design loader + hash/provenance validation, token
  extraction across CSS-var/Tailwind/inline shapes, ΔE color matching, scoring
- [x] 4.2 End-to-end dry run: `web-app` target + `--design linear`, fake
  implementation, asserting the adherence score + scorecard rendering
- [ ] 4.3 Smoke: one real candidate builds the `web-app` target with
  `--design <name>`; record observed adherence and tune thresholds

## 5. Browser measurement (v2 — deferred)

- [ ] 5.1 (Deferred) Computed-style adherence via Playwright once browser-driven
  evaluation lands: read rendered colors/fonts of key elements and compare to
  the spec; higher fidelity than declared-token matching
