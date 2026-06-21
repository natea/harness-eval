## Context

`explore-headroom-compression` looked at one tool (headroom) on the grading path.
ponytail and caveman are a different kind: instruction/skill injection that changes
the *agent's* behavior (write less code; answer tersely) — they act inside the worker
session, not as a proxy. The eval already has pluggable registries (models,
harnesses, candidates, providers); a compression-tool registry fits the same mold and
lets Configure offer compression as an axis.

## Goals / Non-Goals

**Goals:** a pluggable compression-tool registry with headroom/ponytail/caveman;
Configure selection; a clear fairness boundary; measured go/no-go per tool.

**Non-Goals:** adopting any tool by default; silently compressing the graded build; a
new provider/harness; full production wiring before the spike says go.

## Decisions

**1. One registry, two kinds, two apply-points.**
`config/compression.yaml`: `kind` ∈ {`proxy`, `agent-instruction`}; `applyPoint` ∈
{`grading-path`, `worker`}.
- headroom → `proxy`, can target `grading-path` (safe) or `worker` (confound).
- ponytail, caveman → `agent-instruction`, `worker` only (they shape the agent).

**2. Apply-point decides fairness, not the tool.**
- `grading-path`: compress the evaluator/judge calls → operational savings, measured
  artifact unchanged → safe (the headroom exploration's framing).
- `worker`: changes the build + token-spend → a recorded harness/framework+compression
  intervention (like the model-lock confound), never silent.

**3. Worker injection reuses existing seams.**
ponytail/caveman install as a skill / AGENTS.md ruleset into the trial workspace or
the harness config dir (the same `.agents/skills` / `AGENTS.md` path the codex
framework sections use), selected per run and recorded in provenance. The shared base
prompt is unchanged; only the selected, recorded compression instruction is added.

**4. Measurement is per tool, behind a fidelity gate.**
For each tool: token/cost delta on representative trials + a fidelity check (worker
tools: the build still passes grading; grading-path tools: verdicts unchanged). A
tool that breaks conformance or changes verdicts beyond noise is a no-go.

## Risks / Trade-offs

- **Worker compression confounds comparisons** → never a default; provenance +
  scorecard caveat; only an explicit selected axis.
- **A compression tool degrades the build** (ponytail under-builds; caveman drops
  needed detail) → the fidelity gate catches it per tool.
- **Tool-of-different-kinds in one registry** → the `kind`/`applyPoint` fields keep
  the engine generic; the injector/proxy hooks are per-kind.
- **Secrets** → headroom proxy stays localhost/in-trust-boundary; instruction tools
  add no new secret surface.

## Open Questions

- ponytail/caveman exact headless install for our harnesses (skill vs. AGENTS.md) and
  whether their effect is measurable per-trial without their own benchmark harness.
- Whether to keep `explore-headroom-compression` separate or fold it in (this change
  subsumes it; archive that one if this is adopted).
- Does worker-side compression interact with the live-build-stream redaction/parse?
  (Should be transparent — it only changes what the agent writes.)
