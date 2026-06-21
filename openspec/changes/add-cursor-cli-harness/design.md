# Design: Cursor CLI harness driver

Builds on `add-pluggable-harnesses`. Verify against the pinned version at impl.

## Install / run
Pin `cursor-agent` (`curl https://cursor.com/install -fsS | bash`) in
`infra/trial-image`. Headless: `cursor-agent -p "<prompt>" --output-format json`
(or `stream-json`) in the workspace cwd. No REPL.

## Model + auth
`--model <id>` set to the run's worker model; auth via `CURSOR_API_KEY` or a
pre-authenticated `cursor-agent login`. Execution + billing go through Cursor.

## Telemetry
Parse the JSON/stream-json output into `SessionRecord` (turns, tokens, cost). Cost is
Cursor-account metered; record `harness-reported` if emitted, else
`profile-priced`/`tokens-only`. File-redirect + read after exit.

## Routing/account caveat
Cursor runs through its own backend with Cursor's model set and hosted prompts/tools,
so a "matching" model id is not identical to direct provider access. Record a
provenance + scorecard caveat; treat worker-model match as approximate.

## Open questions
- Exact `cursor-agent` non-interactive flags + JSON schema for token/cost usage.
- Headless auth in the sandbox (API key vs login token) and the model id mapping.
