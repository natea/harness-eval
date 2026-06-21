# Proposal: Explore headroom for token-spend savings

## Why

Running the eval costs real tokens. Two distinct spends happen per run: (1) the
**worker build** — the harness agent's tokens, which are a **graded dimension**
(token-spend, 17.5% of the composite); and (2) the **eval's own LLM calls** — the
evaluator/judge that grade each trial (real API/subscription spend that buys no
scored artifact). A 4-candidate × 3-trial matrix plus grading pays both many times.

[`chopratejas/headroom`](https://github.com/chopratejas/headroom) compresses what an
agent reads — tool outputs, files, logs, RAG chunks, conversation history — before it
reaches the model, claiming **60–95% fewer tokens, same answers**, across Anthropic /
OpenAI / Bedrock / Gemini. It ships as a library, a **drop-in proxy** (base-URL
swap), an agent wrapper, and an MCP server, with reversible compression
(originals cached, retrievable) and KV-cache-aligned prefixes.

This is a **feasibility exploration**: where can headroom cut the eval's spend
*without distorting fairness or the measured results*, how much does it actually
save, and does it preserve fidelity — ending in a go/no-go recommendation. The
sharp line: compressing the **grading path** saves eval-operational cost with no
effect on what's measured; compressing the **worker build** changes the very thing
the token-spend dimension measures and confounds the harness comparison, so it is
only ever a flagged, opt-in *intervention*, never a silent default.

## What Changes

Scoped as **investigation + a thin spike + a recommendation**, not adoption:

- **Map safe vs. unsafe application points.** Safe: the evaluator/judge LLM calls
  (eval-internal cost). Unsafe-as-default: the graded worker build (compressing it
  changes the measured token-spend and the artifact — a confound).
- **Spike the proxy on the grading path.** The grader already calls a judge model;
  point those calls at a local `headroom proxy` (base-URL swap, like our existing
  third-party base-URL injection) and measure tokens/cost with vs. without on a set
  of already-archived trials (re-grade, zero new worker spend).
- **Fidelity check.** Verify graded outcomes (scores, verdicts) are unchanged within
  noise with compression on — the "same answers" claim must hold for grading, or
  it's a no-go for the grading path.
- **Characterize the worker-build intervention (optional).** If explored, a
  headroom-wrapped worker is recorded as a harness+compression comparison
  (provenance + scorecard caveat), like the model-lock confound — never a pure
  harness result.
- **Recommendation.** Measured savings + fidelity verdict + a go/no-go on adopting
  headroom for the grading path (and a separate note on the worker-intervention idea).

## Capabilities

### New Capabilities

- `headroom-compression`: an explored integration that compresses the eval's
  grading-path LLM calls to cut operational spend, with a fidelity gate (graded
  outcomes unchanged), a hard boundary excluding the graded worker build by default,
  and a measured go/no-go. (Full adoption is a follow-up if the spike says go.)

## Impact

- **Spike code (throwaway-ok):** a headroom proxy in front of the judge/evaluator
  model calls (base-URL swap in the grading path), plus a measurement script that
  re-grades archived trials with/without compression and diffs scores + token cost.
- **Specs touched at adoption (not now):** `grading-rubric` / `run-telemetry` would
  record a compression posture in provenance if adopted.
- **Invariants:** worker-blind judging preserved; the graded worker build is never
  silently compressed (fairness + token-spend validity); secrets must not leak to
  the headroom proxy (it sits in the eval's trust boundary; redact/keep local).
- **Non-goals:** adopting headroom in production; compressing the worker build by
  default; a new provider/harness. Output-token "terseness steering" on the judge is
  a stretch goal only if input compression passes the fidelity gate.
