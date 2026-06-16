# Design: Pluggable harness drivers

## Today

`src/driver/session.ts` (`executeSessionScript`) imports `runClaudeSession` from
`./claude` and calls it for every step. `config.harness` is recorded in provenance
but is not a dispatch point. `HarnessId = claude-code | opencode | codex`, but only
`claude-code` has a driver.

## The contract

```ts
export interface HarnessRunOptions {
  model: string;            // resolved worker model flag for the harness
  prompt: string;           // rendered base prompt (or continuation text)
  stepIndex: number;
  resume?: string;          // session id / handle for continuation
  timeoutMs: number;
  env?: Record<string, string>;  // model/provider key + endpoint injection
}

export interface HarnessDriver {
  readonly id: HarnessId;
  /** Install commands for the sandbox (pinned version), from the candidate's
   *  per-harness `install` block. */
  installCommands(setup: HarnessSetup): string[];
  /** Run one headless session in the workspace; return the parsed record +
   *  transcript (same shape claude.ts returns today). */
  runSession(sandbox: Sandbox, opts: HarnessRunOptions): Promise<ClaudeResult>;
}
```

`session.ts` picks the driver:

```ts
const driver = HARNESS_DRIVERS[config.harness];   // claude-code | goose | …
const run = opts.runSession ?? driver.runSession;  // keep the test seam
```

`claude.ts`'s `runClaudeSession` becomes `claudeDriver.runSession` verbatim — the
existing behavior, tests, and the `runSession` injection seam are preserved.

## Telemetry normalization

Each driver maps its harness's output to the existing `SessionRecord`
(`durationMs`, `numTurns`, `costUsd`, `usage`, `isError`). Cost source:
- `harness-reported` — the harness emits dollars (Claude Code's `total_cost_usd`),
- `profile-priced` — compute from token usage × model-registry pricing,
- `tokens-only` — only token counts available.

Output capture follows the worker driver's file-redirect pattern (write to a file
in the sandbox, read after exit) so a service the harness starts can't hold the
exec stream open.

## Fairness

- Identical rendered base prompt to every candidate (unchanged).
- Within a run, identical worker-model profile for every candidate (unchanged).
- **Cross-harness runs** pin the same worker model across harnesses; the harness is
  the compared axis. Results keyed by (candidate, harness, workerModel); the
  scorecard notes harness + model so a harness comparison isn't mistaken for a model
  comparison.
- Continuation only from the registry's content-free allowlist; a harness's
  session-resume is transport, never a task hint.

## Scope

This change lands the abstraction and refactors `claude-code` onto it; it adds **no
new harness**. Goose, OpenHands, Gemini CLI, and Grok CLI are separate changes that
each contribute one `HarnessDriver` + its `HarnessId` value + trial-image install.
