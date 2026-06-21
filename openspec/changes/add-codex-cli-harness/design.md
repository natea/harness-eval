# Design: Codex CLI harness driver

Builds on `harness-drivers`. Verify exact flags against the pinned version at impl.

## Install / run
Pin `@openai/codex` (npm) in `infra/trial-image`, version-asserted. Headless:
`codex exec "<prompt>"` (non-interactive automation mode) in the workspace cwd — no
TUI/REPL. Sandbox/approval flags set so the run does not block on interactive gates;
bounded continuation only from the registry's content-free allowlist.

## Model + auth
`OPENAI_API_KEY` (or ChatGPT/Codex sign-in) + the OpenAI model id (e.g.
`gpt-5-codex`) via `--model`/config, from the model registry. The Codex CLI is
OpenAI-only, so a cross-harness run holds the model fixed only against other
OpenAI-capable harnesses.

## Telemetry
Map `codex exec --json` (JSONL event stream) to `SessionRecord` (duration, tokens,
turns). Cost-source per the harness-driver rule: `harness-reported` if Codex emits
dollar cost, else `profile-priced` from OpenAI pricing, else `tokens-only`.
File-redirect output and read after exit (the agent-built-daemon-inherits-stdout
footgun applies here too).

## Contract conformance
Add a Codex conformance fixture (a captured `codex exec --json` sample) to the
driver-contract suite so the driver's dispatch, output-by-file capture, telemetry
normalization, cost-source, and unknown-id rejection are all asserted — same gate
every registered driver passes.

## Harness↔model confound
Codex is model-locked (OpenAI) → a comparison vs Claude Code mixes harness + model.
Record provenance + a scorecard caveat; treat as a pure harness comparison only when
every harness in the run runs the same model. Judge must be neutral (not OpenAI when
Codex is compared).

## Open questions
- Exact non-interactive flags + sandbox/approval settings for the pinned Codex CLI.
- Auth mode in the sandbox (API key vs ChatGPT sign-in) and the model-id mapping.
- Shape/stability of the `codex exec --json` event stream for telemetry parsing.
