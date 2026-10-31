# Kiro CLI Harness

[Kiro CLI](https://kiro.dev/docs/cli/) (`kiro-cli`) is AWS's terminal coding agent
and the successor to the Amazon Q Developer CLI. It is driven headlessly with
`kiro-cli chat --no-interactive --output-format stream-json`; this is the harness
axis of the layer model — a peer of Claude Code, Codex, OpenCode, Qwen Code, and
zerocode.

> Verified against `kiro-cli` 2.37.0 (the stable channel manifest pins the
> version). Re-verify the flags and event shapes when re-pinning `KIRO_VERSION`.

## Install

Pinned in `infra/trial-image/Dockerfile` from the official release zip:

```dockerfile
ARG KIRO_VERSION=2.37.0
RUN curl -fsSL -o /tmp/kiro.zip \
      "https://prod.download.cli.kiro.dev/stable/${KIRO_VERSION}/kirocli-${kiro_arch}-linux.zip" \
 && unzip -q /tmp/kiro.zip -d /tmp/kiro \
 && Q_INSTALL_GLOBAL=1 Q_SKIP_SETUP=1 sh /tmp/kiro/kirocli/install.sh \
 && kiro-cli --version
```

`Q_INSTALL_GLOBAL=1` installs the binaries to `/usr/local/bin`;
`Q_SKIP_SETUP=1` skips the interactive post-install setup. The zip ships
`kirocli/bin/{kiro-cli,kiro-cli-chat,kiro-cli-term}`. Ubuntu 24.04's glibc 2.39
meets the CLI minimum (2.34 x86_64 / 2.39 aarch64).

## How the driver works

`src/driver/kiro.ts` runs one sandbox command per session step:

```sh
kiro-cli chat --no-interactive --trust-all-tools --output-format stream-json \
  --model "claude-sonnet-4.5" [--resume-id "<id>"] "$(cat /tmp/he-prompt-<slot>.txt)" \
  > /tmp/he-out-<slot>.jsonl 2>&1
```

- **Auth**: `KIRO_API_KEY` (Pro/Pro+/Pro Max/Power plans), injected env-only by
  the `kiro` model transport. Use the `kiro-sonnet-4-5` profile.
- **Approvals**: `--trust-all-tools` auto-approves every tool call — acceptable
  only because every trial runs in a disposable sandbox.
- **Resume**: `--resume-id <sessionId>` for gate continuations and later steps.

## Telemetry

`--output-format stream-json` emits one JSON object per line with `type` and
(usually) `data`:

- `runStarted` / `sessionUpdate` carry `data.sessionId`.
- `sessionUpdate.update.sessionUpdate === "agent_message_chunk"` contributes
  `update.content.text` to `resultText`.
- `metadata.turnDurationMs` accumulates into `durationMs`.
- `runFinished` is one completed turn; `status` of `error`/`failed` marks the
  record errored.
- `tokenUsage` events are accepted if present, but Kiro headless runs normally
  report **metering credits**, not token counts.

No `runFinished` and no error event → `SessionParseError` (candidate-side, not
infra).

Kiro meters subscription credits, not per-token USD, so `reportsCost: false`.
Run cost is `profile-priced` (if the profile declares pricing) or `tokens-only`.

## Running

```sh
# 1) Cheap probe on a disposable sandbox
bun run src/cli.ts run --candidates bare --harness kiro \
  --worker-model kiro-sonnet-4-5 --provider docker --trials 1 --trial-minutes 5

# 2) Harness-vs-harness smoke (same target)
bun run src/cli.ts run --candidates bare --harness kiro \
  --worker-model kiro-sonnet-4-5 --provider docker --trials 1 --target symphony-daemon
```

Only `bare` (and candidates that explicitly declare a `kiro:` section) is
selectable. Kiro needs an image-backed provider; `worktree` is rejected because
the host has no pinned Kiro CLI.

Kiro runs vendor-routed models (Claude, and other models in its roster), so a
comparison against a harness on a different model is a **harness+model**
comparison — record that caveat in the scorecard.
