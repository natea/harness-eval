# Bring Your Own PRD

Any spec can become an eval target. A target is a directory under
`targets/<name>/`:

```
targets/my-api/
  target.yaml     # manifest: hashes, conformance pointer, cold-start contract
  PRD.md          # your spec (any structure; normative language helps)
  testplan.yaml   # frozen, weighted, evidence-based checks
  fixtures/       # optional: mocks/stubs the evaluator needs
```

## Steps

1. **Drop in your spec** as `PRD.md` and record its hash:
   `shasum -a 256 targets/my-api/PRD.md`
2. **Author `testplan.yaml`** (see `targets/cli-tool/testplan.yaml` for a
   compact example, `targets/symphony-daemon/testplan.yaml` for a large one):
   - Every step: an `id`, the PRD sections it `covers`, a `description`, an
     observable `check`, and a `weight`.
   - Mark cold-start gates `fatal: true` (failure halts the plan, ViBench
     semantics). Mark OPTIONAL spec items `bonus: true` (never scored).
   - Checks must be *observable behavior* (commands + expected output/exit
     codes/log lines), not code reading. An LLM can draft this plan, but a
     human must review it — that's what the attestation asserts.
3. **Write `target.yaml`**: point at both files with their hashes, name the
   conformance section your prompt will cite, define the cold-start contract
   (`setup.sh` + a run/start script), and pick a coverage mode:
   - `spec-checklist` — your PRD has its own machine-mappable REQUIRED
     checklist (like Symphony §18.1).
   - `attested` — you assert coverage manually; the `attestation` field is
     mandatory and recorded in run provenance.
4. **Declare fixtures** if the evaluator needs live dependencies (mock APIs,
   stub processes). Each gets a name, a `{port}`-templated command, and the
   env var the evaluator receives (see symphony-daemon's mock-linear).
5. **Validate and run:**
   ```sh
   bun run src/cli.ts validate --target my-api
   bun run src/cli.ts run --target my-api --candidates superpowers --trials 1 --provider docker
   ```

## Rules the harness enforces

- PRD hash drift fails the load (re-freeze deliberately, never silently).
- `attested` mode without an attestation blocks the run.
- The rendered base prompt is identical for every candidate in a run.
- Scores are never aggregated across targets (different plans = different
  scales); run each target's matrix separately.
- New targets get a single-candidate smoke trial before any matrix
  (process rule — same discipline as new sandbox providers).
