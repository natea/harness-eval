# Design: Gemini CLI harness driver

Builds on `add-pluggable-harnesses`. Verify against the pinned version at impl.

## Install / run
Pin `@google/gemini-cli` (npm) in `infra/trial-image`. Headless: `gemini -p
"<prompt>"` (non-interactive) in the workspace cwd. No REPL.

## Model + auth
`GEMINI_API_KEY` (or Vertex/OAuth) + the Gemini model via `--model`/`GEMINI_MODEL`,
from the model registry. The Gemini CLI is Gemini-only.

## Telemetry
Map output (JSON mode if the CLI supports it) to `SessionRecord`; cost
`profile-priced` from Gemini pricing or `tokens-only`. File-redirect + read after
exit.

## Harness↔model confound
Gemini CLI is model-locked → a comparison vs Claude Code mixes harness + model.
Record provenance + a scorecard caveat; only treat as a pure harness comparison
when every harness in the run runs the same model.

## Open questions
- Exact non-interactive flags + machine-readable output for the pinned Gemini CLI.
- Auth mode in the sandbox (API key vs OAuth) and model id mapping.
