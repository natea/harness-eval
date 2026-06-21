# Tasks: Explore headroom for token-spend savings

> Investigation + thin spike + recommendation. No production adoption until go.

## 1. Investigation
- [ ] 1.1 Confirm headroom's proxy supports the wire shapes our judge/evaluator use
  (Anthropic + OpenAI) and can be pinned to a version; note install/extras.
- [ ] 1.2 Map the eval's LLM call sites: worker build (graded — out of scope by
  default) vs. evaluator/judge grading calls (in scope). Document the boundary.

## 2. Spike (grading path, zero new worker spend)
- [ ] 2.1 Stand up a local `headroom proxy`; route the grader's judge/evaluator
  model calls at it via a base-URL swap (reuse the existing base-URL injection seam).
- [ ] 2.2 Re-grade a fixed set of archived trials with compression ON vs. OFF.

## 3. Measurement + fidelity
- [ ] 3.1 Diff judge/evaluator token + cost (ON vs. OFF) → quantified savings.
- [ ] 3.2 Diff scores/verdicts (ON vs. OFF) → fidelity within noise, or a fidelity
  failure (hard gate).
- [ ] 3.3 Note secret-safety posture (proxy localhost-bound, in trust boundary, no
  credential egress; archiver redaction applies).

## 4. Recommendation
- [ ] 4.1 Write a go/no-go: measured grading-path savings paired with the fidelity
  verdict; if go, list the follow-up to adopt (provenance posture in
  grading-rubric / run-telemetry, on/off config).
- [ ] 4.2 Separately characterize the worker-build intervention idea (savings vs. the
  harness+compression confound) — note only, not adopted.
- [ ] 4.3 `openspec validate explore-headroom-compression --strict`.
