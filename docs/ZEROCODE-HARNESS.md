# zerocode (ZeroClaw) Harness

zerocode is the first **non-Claude-Code harness with a real agent loop** in this
eval. ZeroClaw (github.com/zeroclaw-labs/zeroclaw, Rust) is an agent runtime;
we drive its coding agent headlessly through `zeroclaw acp`. This is the harness
axis of the layer model — peer to Claude Code and Codex, not a framework like
Superpowers/GSD. See the OpenSpec change `add-zerocode-harness` for rationale.

> **Everything below was verified against the real v0.8.1 binary** (macOS build,
> 2026-06-21), not assumed. Where a detail still needs a live authenticated run
> to confirm, it is called out explicitly.

## What ZeroClaw actually is (verified)

- The release tarball (`zeroclaw-<rust-triple>.tar.gz` — **no version in the
  filename**) ships two binaries at its root plus a `web/dist` bundle:
  - **`zeroclaw`** — the CLI/daemon/ACP server. This is what we drive.
  - **`zerocode`** — an **interactive TUI** config-manager / chat client
    (connects to a local Unix socket or a remote daemon over WSS). For humans;
    **not used in trials** (design Non-Goal).
- `zeroclaw acp` — *"Start the ACP server (JSON-RPC 2.0 over stdio)"*. Methods:
  **`initialize`, `session/new`, `session/prompt`, `session/stop`** (+
  `session/load` for resume). This is the headless surface — **no socket daemon
  is needed**; the agent loop runs inside the ACP server process.
- `zeroclaw providers` lists **74 providers** (anthropic, openai, gemini,
  **minimax**, glm/zai, moonshot, bedrock, groq, mistral, deepseek, …).
- `zeroclaw config` manages a config dir via `config set <dotted.path> <value>`
  and `config schema`.

### Verified ACP wire protocol (drives the parser contract)

```
→ {"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}
← {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":1,"agentInfo":{"name":"zeroclaw-acp","version":"0.8.1"},
     "agentCapabilities":{"loadSession":true,"sessionCapabilities":{"close":{},"resume":{}}},
     "_meta":{"zeroclaw":{"defaultModel":"claude-opus-4-8","maxSessions":1,"sessionTimeoutSecs":3600}},"authMethods":[]}}
→ {"jsonrpc":"2.0","id":1,"method":"session/new","params":{"cwd":"/work","mcpServers":[]}}
← {"jsonrpc":"2.0","id":1,"result":{"sessionId":"<uuid>","workspaceDir":"/work"}}
→ {"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":"<uuid>","prompt":[{"type":"text","text":"…"}]}}
←  (stream of session/update notifications: agent_message_chunk, tool_call, usage …)
← {"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn", "_meta":{…}}}        # turn terminal
   errors come back as {"jsonrpc":"2.0","id":N,"error":{"code":-32000,"message":"…"}}
```

- **`protocolVersion` is `1`** — `ACP_PROTOCOL_VERSION` in `src/driver/zeroclaw.ts`
  matches. A mismatch (or absent handshake) is an **infra failure** (retried,
  not graded), via `ZeroclawProtocolError extends InfraError`.
- The harness parser (`parseZeroclawAcp`) reads `result.protocolVersion`,
  `result.sessionId`, the `session/update` stream, and the prompt result's
  `stopReason`/`_meta` — all confirmed against the wire above.

## Auth — Claude Max subscription works (verified end-to-end)

The OpenSpec proposal assumed ZeroClaw was API-credits-only. **It's not** — the
Claude Max subscription works, with **zero API spend**, verified by a full ACP
turn that wrote a file. But the *headless* credential path is non-obvious and
took experimentation to pin down. The findings (ZeroClaw v0.8.1):

**What does NOT work headlessly (important — saves you the rabbit-hole):**

- `zeroclaw auth paste-token` (authorization OR api-key) saves a profile and
  authenticates the **model catalog**, but the **agent/generation path ignores
  it** — every turn fails `Anthropic credentials not set`.
- Provider env vars (`ANTHROPIC_API_KEY` / `ANTHROPIC_OAUTH_TOKEN`) are documented
  but are **not** read by the configured-provider generation path (only the
  ad-hoc `--provider` path / catalog probe).
- `zeroclaw config set …api_key <value>` can't run headlessly — secret fields
  force masked input and error `IO error: not a terminal`.

**What DOES work — the config env-override (env-only, no TTY, no baked secret):**

```bash
export ZEROCLAW_providers__models__anthropic__anthropic__api_key="$TOKEN"
```

ZeroClaw maps `ZEROCLAW_<dotted__path>` env vars onto config fields at load
(confirmed in the binary). It routes the value by prefix:

| `$TOKEN` | What ZeroClaw does | Cost |
| --- | --- | --- |
| `sk-ant-oat…` (the **Claude Max** token, == `CLAUDE_CODE_OAUTH_TOKEN`) | OAuth / **subscription** auth | **$0 — no API billing** |
| `sk-ant-api…` (an Anthropic API key) | x-api-key auth | per-token (needs a funded API balance) |

So the Max token from `CLAUDE_CODE_OAUTH_TOKEN` — the *same* token Claude Code
uses — gives true Opus parity with no API dollars. (`AnthropicModelProviderConfig`
has only an `api_key` field; the OAuth token rides in it and is detected by
prefix.) The token is env-only and never written to the workspace.

**Recommendation for this eval:** use **Claude Max** (`--worker-model
claude-opus-4-8`) on both harnesses. Use the API-key path only if you have a
funded API balance, or MiniMax (`--worker-model minimax-m2`) to avoid Anthropic
entirely.

## How the driver works

`src/driver/zeroclaw.ts` runs, per session step, a single sandbox command:

1. **Setup (once per trial, marker-gated)** — copy the secret-free template
   `/opt/zeroclaw/trial-config.toml` (defines the `trial` agent + a full-auto
   risk profile: `level=full`, `allowed_commands=["*"]`, sandbox off, and an
   **empty `forbidden_paths`** so the workspace under `/home/ubuntu` is writable —
   the stock `yolo` profile forbids `/home`), then pin `opts.model` via
   `config set providers.models.anthropic.anthropic.model` + `models set`.
2. **Credential** — `export ZEROCLAW_…__api_key="${CLAUDE_CODE_OAUTH_TOKEN:-$ANTHROPIC_API_KEY}"`
   *inside* the shell (the "export inside `bash -lc`" rule), so the `zeroclaw acp`
   the client spawns resolves it. Max token preferred, API key fallback.
3. **One ACP turn** — `bun /opt/zeroclaw/acp-client.ts --prompt-file … --cwd
   "$PWD" --agent trial --config-dir … [--resume <sid>]`. The bundled client
   (`infra/trial-image/zeroclaw-acp-client.ts`) spawns `zeroclaw acp`, drives
   `initialize → session/new (agentAlias=trial) → session/prompt → session/stop`,
   and echoes the wire transcript as JSONL, redirected to a file and read back in
   a separate exec (a started service can't hold the capture open).

**Cost:** ZeroClaw reports tokens but **no billed USD**, so `costUsd` is 0 and the
run cost source is profile-priced (from `config/models.yaml` `pricing`) or
tokens-only — never a fabricated harness-reported figure (`reportsCost: false`).
With Claude Max there is no per-token bill at all; compare **token spend**, not
USD, across harnesses.

## Setup

```sh
# Build the trial image (pins ZeroClaw v0.8.1; bakes both binaries + the ACP client)
docker build -t harness-eval-trial:zerocode infra/trial-image/
# Daytona:
daytona snapshot create harness-eval-base:v4 -f infra/trial-image/Dockerfile \
  -c infra/trial-image \
  --cpu 2 --memory 4 --disk 10
```

`ZEROCLAW_VERSION` (Dockerfile ARG) and `ACP_PROTOCOL_VERSION`
(`src/driver/zeroclaw.ts`) are pinned together — bump in lockstep and re-run the
live probe. Export `CLAUDE_CODE_OAUTH_TOKEN` (Max) in `.env` like any Claude Code
run.

## Running

```sh
# 1) Protocol/auth health on a disposable sandbox (cheap; no model spend on Max)
bun run src/cli.ts run --candidates bare --harness zerocode \
  --worker-model claude-opus-4-6 --provider docker --trials 1 --trial-minutes 5

# 2) The harness-vs-harness smoke once the probe is green
bun run src/cli.ts run --candidates bare --harness zerocode \
  --worker-model claude-opus-4-6 --provider docker --trials 1 \
  --target symphony-daemon --grade
```

A protocol-version mismatch (or an ACP server that never initializes) is recorded
as an **infra failure** and retried — not graded — because the candidate did
nothing wrong; the pinned release drifted. Re-pin and rebuild.

## Harness-comparison methodology

The only like-for-like comparison is **`bare` vs `bare`, holding the model
constant** (Opus, via Claude Max on both):

```
candidate=bare, harness=claude-code, model=opus    ← baseline
candidate=bare, harness=zerocode,    model=opus     ← the new harness
```

- **`bare`** is the harness-agnostic baseline candidate (no framework install,
  shared base prompt as its only session step), valid on every harness. It
  isolates the harness as the single varying factor.
- The four Claude Code frameworks are Claude Code plugins, **not** installable
  into zerocode — their registry entries have no `zerocode` section, so selecting
  them on `--harness zerocode` fails at load time (by design). Never compare a
  framework on one harness against `bare` on another.
- Leaderboards group by `(candidate, harness, model)` and never merge across
  harnesses, so a zerocode trial is a distinct, comparable result key.
- **Compare token spend, not USD.** Claude Code reports Anthropic-billed USD;
  ZeroClaw reports tokens only (and on Max there's no per-token bill).

## Choosing the model (same model on both harnesses)

The run's **worker model** is the single source of truth, and it flows to *both*
harnesses from one place:

- **Claude Code** receives it via `claude --model <id>`.
- **zerocode** receives it via `zeroclaw models set <id>` (run in the driver's
  per-trial setup). The id format is identical — bare `claude-opus-4-x` — so the
  same profile works for both. The model ZeroClaw actually loaded echoes back in
  the ACP `initialize` response (`_meta.zeroclaw.defaultModel`), so a run can
  **verify parity post-hoc** from the transcript.

So a like-for-like head-to-head is just the same `--worker-model` on both runs:

```sh
bun run src/cli.ts run --candidates bare --harness claude-code --worker-model claude-opus-4-8 …
bun run src/cli.ts run --candidates bare --harness zerocode    --worker-model claude-opus-4-8 …
```

**In the studio:** the Configure screen has independent **Harness** and **Worker
model** dropdowns — pick `zerocode` and any model and it flows straight through to
`zeroclaw models set`. `claude-opus-4-8` (ZeroClaw's own default and the current
flagship) is in the list; use it on both harnesses for the cleanest parity.

**In the studio:** the Configure screen has independent **Harness** and **Worker
model** dropdowns — pick `zerocode` and `claude-opus-4-8` and it flows straight
through to `zeroclaw models set`, confirmed by `_meta.defaultModel` in the
transcript.

## Live-probe result (task 3.2 — DONE, verified 2026-06-21)

A full ACP turn ran in the Docker trial image on **Claude Max** auth and the
agent **wrote a file** to the workspace:

```
ZEROCLAW_providers__models__anthropic__anthropic__api_key=$CLAUDE_CODE_OAUTH_TOKEN
→ initialize (protocolVersion 1, _meta.defaultModel=claude-opus-4-8)
→ session/new (agentAlias=trial) → session/prompt
→ 2× tool_call, agent_message_chunk, stopReason=end_turn
→ workspace/hello.txt == "pong"   ✓  (no API spend — subscription)
```

Confirmed: the env-override credential path, the Max-token OAuth routing, the
`claude-opus-4-8` model pin (echoed in `_meta`), full-auto (the agent ran tools
with no approval gate), and a writable workspace.

## Known follow-ups

- **Studio provider for zerocode.** Run zerocode on `docker` (image
  `harness-eval-trial:zerocode`) or Daytona snapshot `v4`, **not** `worktree`
  (the host has no bundled ACP client). The studio now validates this.
- **3.3 graded smoke.** `bare/zerocode/opus` vs `bare/claude-code/opus`, graded,
  for the first real cross-harness number.

## Status of the OpenSpec tasks

Code, config, the bundled ACP client + trial config, tests, and docs are
implemented and green against the **verified** v0.8.1 surface, and a live ACP
turn passed on Max auth (1.1 image/snapshot built; 1.2 protocol verified; 3.2
live probe done). Remaining: the graded cross-harness smoke (3.3).
