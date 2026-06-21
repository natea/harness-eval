# Design: OpenHands harness driver

Builds on the `HarnessDriver` contract from `add-pluggable-harnesses`. OpenHands
specifics — verify against the pinned version at implementation.

## Install
Pinned `openhands-ai` in `infra/trial-image` (`uvx --from openhands-ai openhands` or
`pip install openhands-ai==<pin>`); assert the version.

## Headless run
`openhands --headless -t "<prompt>"` (or `-f <instructions-file>`) in the workspace
cwd, with `--json` for the per-line agent-event stream. Headless mode always
auto-approves (no interactive confirmation); the docs note `--llm-approve` is
unavailable in headless. Continuation, if used, draws only from the registry's
content-free allowlist.

## Model + auth (fairness-critical)
Configure the LLM to the run's pinned worker model via `LLM_MODEL` + `LLM_API_KEY`
(or `~/.openhands/config.toml`), resolved from the model registry. No interactive
setup.

## Telemetry
Parse the `--json` JSONL event stream into `SessionRecord`: turns from agent
action/observation steps; tokens + cost from LLM-usage events when present
(`harness-reported`), else `profile-priced`/`tokens-only`. Redirect the stream to a
file and read after exit.

## Open questions (resolve at implementation)
- Exact event-stream field names for token/cost usage and terminal success/failure.
- The pin: a specific `openhands-ai` release and its CLI flags.
