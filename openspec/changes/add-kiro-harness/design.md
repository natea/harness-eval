# Design: Kiro CLI harness driver

Builds on `add-pluggable-harnesses`. Verified against the 2.37.0 stable release.

## Install / run

Pin the Kiro release zip (`kirocli-<arch>-linux.zip`) in `infra/trial-image`.
The bundle's `install.sh` supports `Q_INSTALL_GLOBAL=1` (install to
`/usr/local/bin`) and `Q_SKIP_SETUP=1` (no interactive setup). Headless:
`kiro-cli chat --no-interactive --trust-all-tools --output-format stream-json
--model <id> [--resume-id <id>] "<prompt>"`. Output is redirected to a file and
read in a separate exec.

## Model + auth

`KIRO_API_KEY` (Pro/Pro+/Power plans) via a new `kiro` transport in
`src/models.ts`; `--model` carries the profile's model id (`kiro-sonnet-4-5`
→ `claude-sonnet-4.5`).

## Telemetry

Events `{type, data}`:

- `runStarted` / `sessionUpdate` → `data.sessionId`.
- `agent_message_chunk` → concatenated final text.
- `metadata.turnDurationMs` → duration.
- `runFinished` → one turn, terminal; non-success status → errored.
- `tokenUsage` accepted if present; normally Kiro reports metering credits.

## Cost source

Kiro meters credits, not per-token USD, so `reportsCost: false`; cost is
profile-priced (if declared) or tokens-only.

## Open questions

- Re-verify flags/events when re-pinning the CLI.
