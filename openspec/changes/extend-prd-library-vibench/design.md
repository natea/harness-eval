# Design: Extend the PRD Library with More ViBench Targets

## Context

A target is `targets/<name>/{target.yaml, PRD.md, testplan.yaml}` with PRD and
test-plan content hashes frozen and recorded per run; `target.yaml` carries a
`source:` provenance block for adapted upstreams (eval-targets spec). The existing
six ViBench targets set the precedent: each adapts a browser-driven ViBench PRD
into an HTTP/JSON API (or served-page) target, drops DOM testing, records
`upstream: vibench-public` + repo + commit + `originalDir` + `license: Apache-2.0`
+ an adaptation note, and is attributed in `targets/NOTICE`. ViBench is Apache-2.0,
so attribution is required. Each ViBench PRD dir is `prds/<x>/{prd, tests}`.

## Decisions

### 1. Same shape, same provenance, per target

Each new target is authored to the existing structure: a `target.yaml` manifest
(name, version, coverageMode, a `source:` block pinned to commit `5baa6892bad7…`
with `originalDir: prds/<x>`), an adapted `PRD.md`, and a `testplan.yaml` whose
steps grade every REQUIRED behavior cold. PRD/test-plan hashes are frozen via the
scaffold (`init`) + freeze flow already used for the current targets.

### 2. Browser → API adaptation, behavior-preserving

ViBench PRDs assume a browser/UI. As the existing targets did, adapt each to an
HTTP/JSON API (and a served root page where the domain implies a UI), and drop
DOM/interaction grading — but keep every REQUIRED behavior expressible as a cold
test-plan step. The adaptation note in `source.note` states exactly what was
dropped, so the comparison to ViBench stays honest.

### 3. Curated batches, not a dump

Author in small batches, picking distinct domains with low overlap against the
current set and clean API-adaptability (first batch: slack, srm, fleet_management,
resume_builder, energy_audit, quiz). Each target is real authoring + a frozen test
plan; batching keeps each reviewable and the freeze deliberate.

### 4. Validate + catalog as the gate

`bun run src/cli.ts validate` checks each new target's schema, freeze binding, and
coverage-mode obligations; `bun run src/cli.ts catalog` regenerates `docs/TARGETS.md`.
A target is "done" only when it validates and is attributed in `NOTICE`.

## Risks / trade-offs

- **Test-plan authoring quality** — a weak test plan grades poorly for everyone; each
  new plan must cover the REQUIRED set with cold, unambiguous checks (the existing
  targets are the bar).
- **Domain fit** — some ViBench PRDs are inherently UI/real-time (online_whiteboard,
  monopoly); these adapt less cleanly to cold API grading and are deprioritized to
  later batches or marked `attested` coverage with a sign-off.
- **Provenance drift** — pin to a single ViBench commit across the batch so the
  adaptations are reproducible; re-pinning is deliberate.
