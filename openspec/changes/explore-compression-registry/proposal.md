# Proposal: A pluggable compression-tool registry (headroom / ponytail / caveman)

> Generalizes `explore-headroom-compression` from one tool into a registry, the
> same way model-registry / candidate-registry / harness drivers are pluggable.

## Why

Several tools claim to cut token spend, but in **different ways and at different
points**, and we want to be able to register them and pick them on the Configure
screen like any other axis:

- [`headroom`](https://github.com/chopratejas/headroom) — an infra **proxy/library**
  that compresses what's *read* before the LLM (input compression, 60–95% fewer
  input tokens). Sits on an LLM call path.
- [`ponytail`](https://github.com/DietrichGebert/ponytail) — **instruction/ruleset
  injection** (plugin / skill / AGENTS.md) that makes the *agent write minimal code*
  (~22% fewer tokens, ~20% cost, ~54% fewer LOC). Acts inside the agent session.
- [`caveman`](https://github.com/JuliusBrussee/caveman) — a **skill/instruction** that
  makes the *agent respond tersely* (~65% output reduction). Acts inside the session.

This is a **feasibility exploration + a registry design**: define a pluggable
compression-tool registry, register these three, make them selectable in Configure,
and — critically — encode where each may apply without distorting fairness or the
measured token-spend dimension. Ends in a go/no-go per tool.

## What Changes

- **Compression-tool registry** (e.g. `config/compression.yaml`, like
  `models.yaml`/`harnesses.yaml`): each tool declares an id, a `kind`
  (`proxy` | `agent-instruction`), an `applyPoint` (`grading-path` | `worker`),
  install/invocation, and selection metadata (summary, savings claim).
- **Fairness boundary (the crux):**
  - `applyPoint: grading-path` (headroom proxy) compresses the eval's own
    judge/evaluator calls — operational savings, **no effect on the measured
    artifact** → safe to use freely.
  - `applyPoint: worker` (ponytail, caveman — and headroom-on-worker) changes the
    build and its token-spend, so it is a **flagged intervention** (harness/framework
    + compression), recorded in provenance + scorecard, **never a silent default**.
- **Configure selection:** the studio lists registered compression tools as a
  selectable axis, showing each tool's kind/apply-point and the fairness caveat for
  worker-applied tools.
- **Explore ponytail + caveman:** wire each (ponytail via AGENTS.md/skill injection;
  caveman via skill/terseness), measure savings on representative trials, and confirm
  the build still passes grading (a compression that breaks conformance is a no-go).
- **Recommendation:** go/no-go per tool, with where each is safe to apply.

## Capabilities

### New Capabilities

- `compression-registry`: a pluggable registry of token-compression tools (id, kind,
  apply-point, install/invocation, selection metadata), the fairness boundary
  (grading-path safe vs. worker = flagged intervention), and a measured go/no-go —
  with headroom, ponytail, caveman as the first entries.

### Modified Capabilities

- `eval-studio`: the Configure view exposes a selectable compression-tool axis with
  each tool's kind/apply-point and the worker-intervention caveat.

## Impact

- **Spike code (throwaway-ok):** a `config/compression.yaml` + loader, a worker-side
  injector (ponytail/caveman into the session) and a grading-path proxy hook
  (headroom), the Configure axis, and a measurement script (savings + grading
  fidelity).
- **Invariants:** the graded worker build is never silently compressed; worker-side
  compression is provenance-flagged as a confound; secrets stay local (headroom
  proxy); the shared base prompt is unchanged except for the explicitly-selected,
  recorded compression instruction.
- **Relationship:** subsumes `explore-headroom-compression` (headroom becomes one
  registered tool); that change can be archived/closed in favor of this registry.
- **Non-goals:** adopting any tool by default; compressing the worker build silently;
  a new provider/harness.
