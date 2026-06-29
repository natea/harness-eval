# E2B sandbox provider — setup, tiers, and cost

`--provider e2b` runs each trial in an E2B Firecracker microVM (build **and**
grade off your local machine). Two prerequisites, both required:

## 1. `E2B_API_KEY`
Set it in `.env` (gitignored; redacted by the archiver). Necessary but **not
sufficient** on its own.

## 2. A built template (the common gotcha)
E2B needs a custom template mirroring `infra/trial-image/Dockerfile` (Ubuntu 24.04,
Node 22, system-wide Bun, git, pinned Claude Code). **If it isn't built/pushed to
*your* E2B account, preflight fails with**:

```
E2B template 'harness-eval-base' not found — build it per infra/e2b-template/README.md
```

That's a missing template, not a bad key. Build it once (requires the `e2b` CLI +
your account) per `infra/e2b-template/README.md`, then pin the resulting tag as
`--snapshot <template>` or in `config/run.defaults.yaml` (`e2bTemplate`).

## Tier requirements (preflight-enforced)
Preflight hard-fails before dispatch if the account tier's max sandbox lifetime is
shorter than the trial wall-clock budget + setup margin (default 15 min):

| Tier | Max sandbox lifetime | Practical trial cap |
|---|---|---|
| **Hobby** | **1 h** | use `--trial-minutes 40` (40 m + 15 m margin ≤ 60 m) |
| **Pro** | 24 h | effectively unbounded for a single trial |

On Hobby, a heavy framework whose build + grade exceeds ~40 min will be refused
(correctly) — split the work, raise the tier, or run that one locally/Docker.

## Cost per trial
E2B bills **per sandbox-second** at the template's vCPU/RAM (default 2 vCPU /
4096 MB). A trial's billed time ≈ (provision + build + grade + teardown) wall-clock
— not the agent's token cost (that's the separate worker-model subscription/API
spend). To observe actual cost-per-trial:

- Watch the **E2B dashboard** (Usage) for the sandbox's lifetime and rate, or
- Read each trial's recorded provider/template provenance + `agentDurationMs` in
  `results.json` and multiply by your tier's per-second rate.

Rough planning figure: a light target (e.g. `rest-api`) on a prompt/skill
framework is typically a few sandbox-minutes; heavyweight frameworks (MCP swarms,
`./setup`-heavy stacks) run longer and are the ones most worth offloading to E2B in
the first place. Record observed figures here as you run real matrices.
