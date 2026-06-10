# Tasks: Add PRD Library and Custom PRD Support

## 1. Target Abstraction

- [ ] 1.1 Define target manifest schema (zod) and loader with hash/coverage-mode validation
- [ ] 1.2 Migrate Symphony content-identical into `targets/symphony-daemon/` (PRD, test plan, mock Linear, stub app-server); update CLI/grading paths; assert hashes unchanged
- [ ] 1.3 Parameterize the base prompt template with target slots (PRD file, conformance pointer, deliverables); default `--target symphony-daemon`
- [ ] 1.4 Generalize fixture lifecycle: grading runner starts/stops manifest-declared fixture processes per trial

## 2. CLI

- [ ] 2.1 `target init <name> --spec <file>` scaffolding (manifest + test-plan skeleton; optional LLM-assisted draft step documented as requiring human review)
- [ ] 2.2 `target validate <name>`; wire into run preflight
- [ ] 2.3 Record target name/version/hashes in provenance, results.json, and scorecards; reporting refuses cross-target aggregation

## 3. Library Targets

- [ ] 3.1 Author `cli-tool` target (PRD, weighted test plan with fatal gates, exit-code/stdout fixtures); smoke trial
- [ ] 3.2 Author `rest-api` target (PRD, test plan, HTTP-check fixtures); smoke trial
- [ ] 3.3 Author `web-app` target (PRD, test plan, HTTP/DOM-light fixtures — REPL evaluator, no browser dependency in v1); smoke trial
- [ ] 3.4 Per-target budget defaults in run config

## 4. Validation and Docs

- [ ] 4.1 Unit tests: manifest validation, migration hash parity, cross-target aggregation refusal
- [ ] 4.2 End-to-end dry run on a non-Symphony target
- [ ] 4.3 Author "bring your own PRD" guide in `docs/`
