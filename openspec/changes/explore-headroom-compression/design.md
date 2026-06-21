## Context

Per-run spend has two sources: the **worker build** (graded; token-spend is 17.5% of
the composite) and the **eval's own grading calls** (evaluator + judge models — real
spend buying no scored artifact). The model registry already injects a base URL for
third-party endpoints (`ANTHROPIC_BASE_URL` via `resolveClaudeCodeEnv`), so a
base-URL swap to a local proxy is a natural seam. headroom offers library / proxy /
wrapper / MCP modes, reversible compression, and KV-cache-aligned prefixes.

## Goals / Non-Goals

**Goals:**
- Find where headroom cuts eval spend without distorting fairness or results.
- Measure grading-path savings and verify grading fidelity.
- End with a go/no-go.

**Non-Goals:**
- Adopting headroom in production now; compressing the graded worker build by
  default; a new provider/harness. Output-token steering is a stretch goal only.

## Decisions

**1. Target the grading path first, not the worker build.**
The judge/evaluator calls are eval-operational cost; compressing them changes no
measured artifact. The worker build's tokens ARE the measured thing, so compressing
it is a confound (treated like the model-lock caveat) — out of scope as a default.

**2. Proxy mode via base-URL swap.**
Run `headroom proxy` locally and point the grader's model calls at it (the same
base-URL injection path the registry already uses). Zero changes to judge logic;
easy on/off for A/B.
- *Alternatives:* library (`compress(messages)`) needs grader code changes; MCP/
  wrapper don't fit the grader's call shape. Proxy is the least-invasive spike.

**3. Re-grade archived trials for measurement — zero new worker spend.**
Re-grade a fixed set of already-built trials with compression on vs. off and diff
(a) judge/evaluator token + cost, and (b) the resulting scores/verdicts. This
isolates grading-path savings and fidelity without spending on new builds.

**4. Fidelity is a hard gate.**
If compressed grading changes verdicts/scores beyond noise, recommend no-go for the
grading path regardless of savings — a cheaper-but-wrong judge is worse than none.

## Risks / Trade-offs

- **Compression alters judgments** → measured fidelity gate; reversible retrieval
  (`headroom_retrieve`) as a mitigation to test.
- **Secret exposure to the proxy** → localhost-bound, in-trust-boundary, archiver
  redaction rules apply; never route to an external compressor service.
- **Cache-alignment interaction** → our judge calls may already hit provider caches;
  measure net effect (compression can help or hurt cache hits).
- **Scope creep to the worker build** → explicitly forbidden as a default; only a
  flagged intervention with a recorded confound.

## Open Questions

- Does headroom's proxy speak the Anthropic + OpenAI wire shapes our judge/evaluator
  use, and can it be pinned to a version?
- Is the grading path's content (scrubbed workspace diffs, transcripts) the kind of
  input headroom compresses well, and at what fidelity?
- Worth a separate look at output-token "terseness steering" for verbose judges?
