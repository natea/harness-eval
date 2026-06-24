# Local Model Support — Phase 1 (Local Workers via Codex OSS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the harness run a local open-source model (Ollama or LM Studio) as the build *worker*, driven through the Codex harness's built-in OSS mode, selectable by model-profile name like any other model.

**Architecture:** Local models slot into the existing model-profile system (`config/models.yaml` → `src/models.ts`). A new `authKind: "none"` (no credential) and an optional `ossProvider` marker on a profile cause the Codex driver to emit `codex exec --oss --local-provider <ollama|lmstudio> --model <id>` and skip API-key login. The marker is threaded through the existing worker-env → scheduler → session → driver chain.

**Tech Stack:** Bun, TypeScript, Zod (profile schema), the OpenAI Codex CLI (`@openai/codex`), Ollama / LM Studio local servers.

## Global Constraints

- Runtime is **Bun**: run tests with `bun run test` (NOT bare `bun test` — it path-matches archived workspaces under `runs/` and fails). Run the CLI with `bun run src/cli.ts …`.
- TypeScript source uses **tab** indentation. Match it exactly.
- **Codex pin floor:** `--oss`/`--local-provider` were verified on `codex-cli 0.142.0`; the harness pins `0.50.0`. Task 0 raises the pin and is a hard prerequisite for Tasks 5–9.
- **Fairness/secrets invariants (do not break):** secrets stay env-only; new key patterns go in `src/driver/archive.ts` redaction. Local endpoint URLs are not secrets but are documented with the keys.
- **Cost honesty:** a local profile has no pricing → cost source is `tokens-only`. Never label it `harness-reported`.
- `ossProvider` is only valid with `transport: codex` and implies `authKind: none` — enforce in schema.

---

### Task 0: Raise the Codex pin to a version with `--oss` (BLOCKER)

**Files:**
- Modify: `config/harnesses.yaml:17` (codex `defaultVersion`)
- Modify: `infra/trial-image/Dockerfile:30` (`ARG CODEX_VERSION`)

**Interfaces:**
- Produces: a Codex toolchain (local dev + trial image) that exposes `codex exec --oss --local-provider`. Tasks 5–9 depend on this.

- [ ] **Step 1: Verify the flags exist at the target version**

Run:
```bash
npm install -g @openai/codex@0.142.0 && codex exec --help | grep -E -- "--oss|--local-provider"
```
Expected: two lines — `--oss  Use open-source provider` and `--local-provider <OSS_PROVIDER>  Specify which local provider to use (lmstudio or ollama)`. If `0.142.0` is unavailable, pick the lowest published version where the grep succeeds and use that everywhere below.

- [ ] **Step 2: Bump the harness registry pin**

In `config/harnesses.yaml`, change the codex entry:
```yaml
  - id: codex
    name: Codex CLI
    driver: codex
    defaultVersion: 0.142.0
    reportsCost: false
```

- [ ] **Step 3: Bump the trial image pin**

In `infra/trial-image/Dockerfile`:
```dockerfile
ARG CODEX_VERSION=0.142.0
```

- [ ] **Step 4: Validate config still loads**

Run: `bun run src/cli.ts validate`
Expected: exits 0; no harness-registry errors.

- [ ] **Step 5: Commit**

```bash
git add config/harnesses.yaml infra/trial-image/Dockerfile
git commit -m "chore(codex): pin Codex CLI to a version with --oss local-provider support"
```

---

### Task 1: Add `authKind: "none"` and make `authEnv` optional

**Files:**
- Modify: `src/models.ts` (`AuthKind` enum, `ModelProfile` schema)
- Test: `src/models.test.ts` (create if absent)

**Interfaces:**
- Produces: `AuthKind` includes `"none"`; `ModelProfile.authEnv` is optional; a `none` profile parses without `authEnv`, and a non-`none` profile without `authEnv` is rejected.

- [ ] **Step 1: Write the failing test**

In `src/models.test.ts`:
```ts
import { expect, test } from "bun:test";
import { ModelProfile } from "./models";

test("authKind none parses without authEnv", () => {
	const p = ModelProfile.parse({
		name: "local-x",
		provider: "ollama",
		modelId: "qwen3-coder",
		transport: "codex",
		authKind: "none",
	});
	expect(p.authEnv).toBeUndefined();
});

test("non-none auth kind requires authEnv", () => {
	const r = ModelProfile.safeParse({
		name: "needs-key",
		provider: "openai",
		modelId: "gpt-5-codex",
		transport: "codex",
		authKind: "api-key",
	});
	expect(r.success).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/models.test.ts`
Expected: FAIL — `none` is not a valid enum value / `authEnv` required.

- [ ] **Step 3: Implement**

In `src/models.ts`, extend the enum:
```ts
export const AuthKind = z.enum(["oauth", "auth-token", "api-key", "none"]);
```
Make `authEnv` optional in `ModelProfile`:
```ts
		/** Env var name holding the credential (omit only for authKind 'none'). */
		authEnv: z.string().min(1).optional(),
```
Add a refinement after the existing `auth-token` refine:
```ts
	.refine((p) => p.authKind === "none" || !!p.authEnv, {
		message: "authEnv is required unless authKind is 'none'",
	})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/models.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/models.ts src/models.test.ts
git commit -m "feat(models): add authKind 'none' with optional authEnv"
```

---

### Task 2: Add the `ossProvider` profile marker

**Files:**
- Modify: `src/models.ts` (`ModelProfile` schema)
- Test: `src/models.test.ts`

**Interfaces:**
- Produces: `ModelProfile.ossProvider?: "ollama" | "lmstudio"`, valid only with `transport: codex` and `authKind: none`.

- [ ] **Step 1: Write the failing test**

Append to `src/models.test.ts`:
```ts
test("ossProvider requires codex transport and authKind none", () => {
	const ok = ModelProfile.safeParse({
		name: "ollama-x", provider: "ollama", modelId: "qwen3-coder",
		transport: "codex", authKind: "none", ossProvider: "ollama",
	});
	expect(ok.success).toBe(true);

	const badTransport = ModelProfile.safeParse({
		name: "bad1", provider: "ollama", modelId: "m",
		transport: "anthropic-sdk", authKind: "none", ossProvider: "ollama",
	});
	expect(badTransport.success).toBe(false);

	const badAuth = ModelProfile.safeParse({
		name: "bad2", provider: "ollama", modelId: "m",
		transport: "codex", authKind: "api-key", authEnv: "K", ossProvider: "ollama",
	});
	expect(badAuth.success).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/models.test.ts`
Expected: FAIL — `ossProvider` unknown key / refinements absent.

- [ ] **Step 3: Implement**

In `ModelProfile`, add the field (after `authKind`):
```ts
		/** Codex OSS-mode local provider; implies transport codex + authKind none. */
		ossProvider: z.enum(["ollama", "lmstudio"]).optional(),
```
Add two refinements:
```ts
	.refine((p) => !p.ossProvider || p.transport === "codex", {
		message: "ossProvider requires transport 'codex'",
	})
	.refine((p) => !p.ossProvider || p.authKind === "none", {
		message: "ossProvider implies authKind 'none'",
	})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models.ts src/models.test.ts
git commit -m "feat(models): add ossProvider marker for Codex OSS workers"
```

---

### Task 3: Resolve OSS workers in `resolveWorkerEnv`

**Files:**
- Modify: `src/models.ts` (`ResolvedWorker` interface, `resolveWorkerEnv`)
- Test: `src/models.test.ts`

**Interfaces:**
- Consumes: `ModelProfile` with `ossProvider` (Task 2).
- Produces: `ResolvedWorker.ossProvider?: "ollama" | "lmstudio"`. For an OSS profile, `resolveWorkerEnv` returns `{ modelFlag: <modelId>, ossProvider, note: "local oss: <provider>" }` and **no** auth env.

- [ ] **Step 1: Write the failing test**

Append to `src/models.test.ts`:
```ts
import { resolveWorkerEnv } from "./models";

test("resolveWorkerEnv returns ossProvider and no auth env for a local profile", () => {
	const p = ModelProfile.parse({
		name: "ollama-x", provider: "ollama", modelId: "qwen3-coder",
		transport: "codex", authKind: "none", ossProvider: "ollama",
	});
	const rw = resolveWorkerEnv(p, {});
	expect(rw.ossProvider).toBe("ollama");
	expect(rw.modelFlag).toBe("qwen3-coder");
	// Empty (not undefined) so the scheduler's native fallback does NOT inject an
	// ambient CLAUDE_CODE_OAUTH_TOKEN into a credential-free local trial
	// (scheduler.ts treats a falsy workerEnv as "use the native auth fallback").
	expect(rw.env).toEqual({});
	expect(rw.note).toContain("ollama");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/models.test.ts`
Expected: FAIL — `ossProvider` not on `ResolvedWorker` / not returned.

- [ ] **Step 3: Implement**

In `src/models.ts`, add to `ResolvedWorker`:
```ts
	/** Codex OSS local provider, threaded to the codex driver's --local-provider. */
	ossProvider?: "ollama" | "lmstudio";
```
In `resolveWorkerEnv`, at the very top of the `if (p.transport === "codex") {` block (before the oauth/api-key handling):
```ts
		if (p.ossProvider) {
			// Local OSS model: no credential, no login. The codex driver adds
			// `--oss --local-provider <ossProvider>`. Return an EMPTY env (not
			// undefined) so the scheduler's native auth fallback doesn't inject an
			// ambient OAuth token into a credential-free trial.
			return {
				env: {},
				modelFlag: p.modelId,
				ossProvider: p.ossProvider,
				note: `local oss: ${p.ossProvider}`,
			};
		}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models.ts src/models.test.ts
git commit -m "feat(models): resolve OSS local workers (no auth env, carry ossProvider)"
```

---

### Task 4: Thread `ossProvider` through the driver chain

**Files:**
- Modify: `src/driver/types.ts` (`DriverRunOptions`)
- Modify: `src/driver/session.ts` (`SessionScriptOptions`, both `run(...)` calls)
- Modify: `src/orchestrator/scheduler.ts` (deps type + `exec(...)` call)
- Modify: `src/cli.ts` (pass `rw.ossProvider` into scheduler deps)
- Modify: `src/studio/run-exec.ts` (pass `rw.ossProvider` into scheduler deps)
- Test: `src/driver/session.test.ts` (create if absent)

**Interfaces:**
- Consumes: `ResolvedWorker.ossProvider` (Task 3).
- Produces: `DriverRunOptions.ossProvider?: "ollama" | "lmstudio"` reaching the driver's `runSession`. `SessionScriptOptions.ossProvider?` and `scheduler` dep `workerOssProvider?` carry it.

- [ ] **Step 1: Write the failing test**

In `src/driver/session.test.ts`:
```ts
import { expect, test } from "bun:test";
import { executeSessionScript } from "./session";
import type { DriverRunOptions } from "./types";

test("executeSessionScript forwards ossProvider to the driver", async () => {
	const seen: DriverRunOptions[] = [];
	const fakeSandbox = { id: "worktree:t1" } as never;
	await executeSessionScript(fakeSandbox, {
		model: "qwen3-coder",
		steps: [{ prompt: "hi", newSession: true }],
		continuation: { maxContinuations: 0, allowlist: [] },
		wallClockBudgetMs: 60_000,
		costBudgetUsd: 1,
		ossProvider: "ollama",
		runSession: async (_s, opts) => {
			seen.push(opts);
			return {
				record: { sessionId: "s", stepIndex: 0, durationMs: 0, numTurns: 1,
					costUsd: 0, usage: { inputTokens: 0, outputTokens: 0,
					cacheReadTokens: 0, cacheCreationTokens: 0 }, isError: false },
				resultText: "done", sessionId: "s", transcript: "{}",
			};
		},
	});
	expect(seen[0]?.ossProvider).toBe("ollama");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/driver/session.test.ts`
Expected: FAIL — `ossProvider` not accepted by `SessionScriptOptions` / not forwarded.

- [ ] **Step 3: Implement the threading**

`src/driver/types.ts` — add to `DriverRunOptions`:
```ts
	/** Codex OSS local provider; the codex driver adds --oss --local-provider. */
	ossProvider?: "ollama" | "lmstudio";
```
`src/driver/session.ts` — add to `SessionScriptOptions`:
```ts
	/** Codex OSS local provider, forwarded to the driver on every step. */
	ossProvider?: "ollama" | "lmstudio";
```
…and add `ossProvider: opts.ossProvider,` to BOTH `run(sandbox, { … })` option objects (the main step call ~line 77 and the continuation call ~line 116).

`src/orchestrator/scheduler.ts` — add to the deps interface (near `workerModelFlag?`):
```ts
	workerOssProvider?: "ollama" | "lmstudio";
```
…and add `ossProvider: deps.workerOssProvider,` to the `exec(sandbox, { … })` options object (~line 289).

`src/cli.ts` — in the scheduler deps object (the block containing `workerEnv,` / `workerModelFlag,` ~line 274), add:
```ts
			workerOssProvider: rw.ossProvider,
```
`src/studio/run-exec.ts` — same addition wherever it builds the scheduler deps from `rw` (mirror the `workerModelFlag` line ~123).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/driver/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole chain**

Run: `bun run test` (full suite) — confirms scheduler/cli/studio still compile and no existing test regressed.
Expected: PASS / green.

- [ ] **Step 6: Commit**

```bash
git add src/driver/types.ts src/driver/session.ts src/orchestrator/scheduler.ts src/cli.ts src/studio/run-exec.ts src/driver/session.test.ts
git commit -m "feat(driver): thread ossProvider from worker profile to the session driver"
```

---

### Task 5: Emit `--oss --local-provider` and skip login in the Codex driver

**Files:**
- Modify: `src/driver/codex.ts` (`buildCommand`)
- Test: `src/driver/codex.test.ts` (create if absent)

**Interfaces:**
- Consumes: `PrintCliCommandContext.ossProvider` (inherited from `DriverRunOptions`, Task 4).
- Produces: a `codex exec` command that includes `--oss --local-provider <provider>` and omits the auth block when `ossProvider` is set; unchanged otherwise.

- [ ] **Step 1: Write the failing test**

In `src/driver/codex.test.ts` — exercise the same `buildCommand` the driver uses. Import the builder; if `buildCommand` is currently a private const, export it from `codex.ts` as `export const buildCodexCommand = (opts) => …` and have the runner use it.
```ts
import { expect, test } from "bun:test";
import { buildCodexCommand } from "./codex";

const base = {
	model: "qwen3-coder", prompt: "x", stepIndex: 0, timeoutMs: 1000,
	promptFile: "/tmp/p.txt", outFile: "/tmp/o.jsonl",
} as const;

test("oss profile adds --oss --local-provider and no codex login", () => {
	const cmd = buildCodexCommand({ ...base, ossProvider: "ollama" });
	expect(cmd).toContain("--oss --local-provider ollama");
	expect(cmd).toContain("--model \"qwen3-coder\"");
	expect(cmd).not.toContain("codex login");
});

test("non-oss profile keeps the auth block", () => {
	const cmd = buildCodexCommand({ ...base });
	expect(cmd).toContain("codex login");
	expect(cmd).not.toContain("--oss");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/driver/codex.test.ts`
Expected: FAIL — builder not exported / `--oss` not emitted.

- [ ] **Step 3: Implement**

In `src/driver/codex.ts`, extract the `buildCommand` body into an exported function and have `createPrintCliSessionRunner({ buildCommand: buildCodexCommand, … })` reference it. Inside it:
```ts
	const oss = opts.ossProvider
		? `--oss --local-provider ${opts.ossProvider}`
		: "";
```
Add `oss` to the `exec` array immediately after `"codex exec"` (before `resume`):
```ts
		const exec = [
			"codex exec",
			oss,
			resume,
			modelFlag,
			"--json",
			"--dangerously-bypass-approvals-and-sandbox",
			"--skip-git-repo-check",
			`- < ${opts.promptFile}`,
			`> ${opts.outFile} 2>&1`,
		]
			.filter(Boolean)
			.join(" ");
```
Skip the auth block for OSS (no login, no credential):
```ts
		const auth = opts.ossProvider
			? ""
			: `export CODEX_HOME=${codexHome}; mkdir -p ${codexHome}; ` + /* …existing… */ ;
		return [auth, exec].filter(Boolean).join("; ");
```
(Keep the existing auth string verbatim for the non-OSS branch; only wrap it in the ternary and add `.filter(Boolean)` to the final join so an empty auth doesn't leave a leading `; `.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/driver/codex.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/driver/codex.ts src/driver/codex.test.ts
git commit -m "feat(codex): drive local OSS models via --oss --local-provider, skip login"
```

---

### Task 6: Local-endpoint reachability probe + URL behavior

**Files:**
- Create: `src/models-probe.ts` (`probeLocalEndpoint`)
- Modify: `src/cli.ts` (the `model probe` branch ~line 313–361)
- Test: `src/models-probe.test.ts`

**Interfaces:**
- Consumes: a `ModelProfile` with `ossProvider`.
- Produces: `probeLocalEndpoint(profile, fetchFn, env) => Promise<{ ok: boolean; detail: string }>` — GETs Ollama `/api/tags` or LM Studio `/v1/models`, confirms the profile's `modelId` is present. Base URL from `OLLAMA_BASE_URL` (default `http://localhost:11434`) / `LMSTUDIO_BASE_URL` (default `http://localhost:1234`).

> **URL behavior decision (spec task 1.85):** Codex's `--oss` uses its own default ports for the *worker*. `OLLAMA_BASE_URL`/`LMSTUDIO_BASE_URL` are used by the **probe** (and Phase 2 judges); document that non-default worker URLs are not honored by Codex `--oss` unless a later verification shows otherwise.

- [ ] **Step 1: Write the failing test**

In `src/models-probe.test.ts`:
```ts
import { expect, test } from "bun:test";
import { ModelProfile } from "./models";
import { probeLocalEndpoint } from "./models-probe";

const ollama = ModelProfile.parse({
	name: "ollama-x", provider: "ollama", modelId: "qwen3-coder",
	transport: "codex", authKind: "none", ossProvider: "ollama",
});

test("probe passes when the model is present", async () => {
	const fetchFn = async () =>
		new Response(JSON.stringify({ models: [{ name: "qwen3-coder" }] }), { status: 200 });
	const r = await probeLocalEndpoint(ollama, fetchFn as typeof fetch, {});
	expect(r.ok).toBe(true);
});

test("probe fails when the model is missing", async () => {
	const fetchFn = async () =>
		new Response(JSON.stringify({ models: [{ name: "llama3.1" }] }), { status: 200 });
	const r = await probeLocalEndpoint(ollama, fetchFn as typeof fetch, {});
	expect(r.ok).toBe(false);
	expect(r.detail).toContain("qwen3-coder");
});

test("probe fails when the server is unreachable", async () => {
	const fetchFn = async () => { throw new Error("ECONNREFUSED"); };
	const r = await probeLocalEndpoint(ollama, fetchFn as typeof fetch, {});
	expect(r.ok).toBe(false);
	expect(r.detail).toMatch(/unreachable|ECONNREFUSED/);
});

test("modelId 'default' checks reachability only, not model presence", async () => {
	const lmstudio = ModelProfile.parse({
		name: "lmstudio-default", provider: "lmstudio", modelId: "default",
		transport: "codex", authKind: "none", ossProvider: "lmstudio",
	});
	// LM Studio lists loaded models by real id, never literally "default".
	const fetchFn = async () =>
		new Response(JSON.stringify({ data: [{ id: "some-loaded-model" }] }), { status: 200 });
	const r = await probeLocalEndpoint(lmstudio, fetchFn as typeof fetch, {});
	expect(r.ok).toBe(true); // reachable + a model is loaded → OK
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/models-probe.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Implement**

Create `src/models-probe.ts`:
```ts
import type { ModelProfile } from "./models";

export async function probeLocalEndpoint(
	p: ModelProfile,
	fetchFn: typeof fetch = fetch,
	env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; detail: string }> {
	const isOllama = p.ossProvider === "ollama";
	const base = isOllama
		? (env.OLLAMA_BASE_URL ?? "http://localhost:11434")
		: (env.LMSTUDIO_BASE_URL ?? "http://localhost:1234");
	const url = isOllama ? `${base}/api/tags` : `${base}/v1/models`;
	let names: string[];
	try {
		const res = await fetchFn(url);
		if (!res.ok) return { ok: false, detail: `${url} returned ${res.status}` };
		const body = (await res.json()) as Record<string, unknown>;
		// Ollama: { models: [{ name }] }; LM Studio (OpenAI): { data: [{ id }] }.
		const list = (body.models ?? body.data ?? []) as Record<string, unknown>[];
		names = list.map((m) => String(m.name ?? m.id ?? ""));
	} catch (e) {
		return { ok: false, detail: `${url} unreachable: ${(e as Error).message}` };
	}
	// `default` is the Codex sentinel for "use whatever model is loaded" (LM Studio).
	// The server never lists a model literally named "default", so for it we check
	// reachability + that SOME model is loaded, not a specific name.
	if (p.modelId === "default") {
		if (names.length === 0) {
			return { ok: false, detail: `${url} reachable but no model is loaded` };
		}
		return { ok: true, detail: `${url} reachable; loaded: ${names.join(", ")}` };
	}
	if (!names.includes(p.modelId)) {
		return {
			ok: false,
			detail: `model '${p.modelId}' not found at ${url}; pull it (e.g. \`ollama pull ${p.modelId}\`). Present: ${names.join(", ") || "none"}`,
		};
	}
	return { ok: true, detail: `${p.modelId} present at ${url}` };
}
```
In `src/cli.ts`, in the `model probe` branch, BEFORE the existing claude-code-only rejection, add:
```ts
		if (profile.ossProvider) {
			const { probeLocalEndpoint } = await import("./models-probe");
			const r = await probeLocalEndpoint(profile);
			console[r.ok ? "log" : "error"](`${r.ok ? "✓" : "✗"} probe ${r.ok ? "OK" : "FAILED"} — ${r.detail}`);
			process.exit(r.ok ? 0 : 1);
		}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/models-probe.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/models-probe.ts src/models-probe.test.ts src/cli.ts
git commit -m "feat(probe): reachability + model-present check for local OSS endpoints"
```

---

### Task 7: Example profiles, `.env.example`, and redaction docs

**Files:**
- Modify: `config/models.yaml`
- Modify: `.env.example`
- Modify: `src/driver/archive.ts` (redaction/doc list)

**Interfaces:**
- Produces: selectable profiles `ollama-qwen3-coder`, `ollama-llama3.1`, `lmstudio-default`.

- [ ] **Step 1: Add the profiles**

> **Verify the model tags first.** Confirm each `modelId` is a real pullable tag
> before committing it as an example: `ollama pull qwen3-coder` and `ollama pull
> llama3.1` must succeed (check the Ollama library). If a tag differs (e.g.
> `qwen2.5-coder`), use the real tag in the profile. `lmstudio-default` uses the
> `default` sentinel, so no tag check applies there.

Append to the `profiles:` list in `config/models.yaml`:
```yaml
  # --- Local open-source models via Codex OSS mode (zero credential) ---
  # Driven by `codex exec --oss --local-provider <ollama|lmstudio>`. No pricing →
  # cost source is tokens-only. Start the server first (`ollama serve`; LM Studio
  # local server) and `model probe <name>` to confirm reachability.
  - name: ollama-qwen3-coder
    provider: ollama
    modelId: qwen3-coder
    transport: codex
    ossProvider: ollama
    authKind: none

  - name: ollama-llama3.1
    provider: ollama
    modelId: llama3.1
    transport: codex
    ossProvider: ollama
    authKind: none

  - name: lmstudio-default
    provider: lmstudio
    modelId: default
    transport: codex
    ossProvider: lmstudio
    authKind: none
```

- [ ] **Step 2: Document the endpoint env vars**

In `.env.example`, add:
```sh
# Local model servers (optional; defaults shown). Used by `model probe` and
# openai-compat judges. Not secrets. Codex --oss workers use Codex's defaults.
OLLAMA_BASE_URL=http://localhost:11434
LMSTUDIO_BASE_URL=http://localhost:1234
```

- [ ] **Step 3: Note the keys in the redaction source**

In `src/driver/archive.ts`, add `OLLAMA_BASE_URL` and `LMSTUDIO_BASE_URL` to the documented env list (these are URLs, not secrets, but keep the single source of truth complete). No new secret pattern is required for Phase 1.

- [ ] **Step 4: Validate**

Run: `bun run src/cli.ts validate`
Expected: exits 0; the three new profiles load without schema errors.

- [ ] **Step 5: Commit**

```bash
git add config/models.yaml .env.example src/driver/archive.ts
git commit -m "feat(models): add example Ollama/LM Studio profiles + endpoint env docs"
```

---

### Task 8: Studio cost-source parity (gap #6)

**Files:**
- Modify: `src/studio/run-exec.ts` (the `buildResults({ … costSource })` call ~line 265)
- Test: `src/studio/run-exec.test.ts` (create if absent) OR assert via an existing studio test

**Interfaces:**
- Consumes: `costSourceForHarness(profile, harnessReportsCost)` (already in `src/models.ts`).
- Produces: an exported pure helper `studioCostSource(dryRun, profile, reportsCost): CostSource` in `run-exec.ts`, used in place of the hardcode. A Studio non-dry run records the same cost source the CLI would — `tokens-only` for a free local Codex worker, not `harness-reported`.

> **Why a helper, not just an inline call:** a unit test asserting
> `costSourceForHarness(local, false) === "tokens-only"` is vacuous — it passes today
> against unchanged library code and does NOT prove the Studio hardcode was removed.
> Extracting `studioCostSource` gives the test something that only goes green once
> `run-exec` actually delegates to it, and Step 4's grep guarantees the literal
> hardcode is gone.

- [ ] **Step 1: Write the failing test**

In `src/studio/run-exec.test.ts`:
```ts
import { expect, test } from "bun:test";
import { ModelProfile } from "../models";
import { studioCostSource } from "./run-exec";

const local = ModelProfile.parse({
	name: "ollama-x", provider: "ollama", modelId: "qwen3-coder",
	transport: "codex", authKind: "none", ossProvider: "ollama",
});

test("non-dry local codex worker → tokens-only (not harness-reported)", () => {
	expect(studioCostSource(false, local, false)).toBe("tokens-only");
});

test("dry run is always tokens-only", () => {
	expect(studioCostSource(true, local, false)).toBe("tokens-only");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/studio/run-exec.test.ts`
Expected: FAIL — `studioCostSource` is not exported.

- [ ] **Step 3: Implement the Studio fix**

In `src/studio/run-exec.ts`, import and export the helper:
```ts
import { /* …existing… */ costSourceForHarness } from "../models";
import type { CostSource } from "../models";

export function studioCostSource(
	dryRun: boolean,
	profile: Parameters<typeof costSourceForHarness>[0],
	reportsCost: boolean,
): CostSource {
	return dryRun ? "tokens-only" : costSourceForHarness(profile, reportsCost);
}
```
Resolve the harness's `reportsCost` from the loaded harness registry (the file already calls `loadHarnesses()` — look up the entry for `inp.config.harness`, mirroring `src/cli.ts:199`; default `false` if missing), then replace the hardcoded line:
```ts
			costSource: dryRun ? "tokens-only" : "harness-reported",
```
with:
```ts
			costSource: studioCostSource(dryRun, inp.workerProfile, harnessReportsCost),
```

- [ ] **Step 4: Verify the hardcode is gone + suite green**

Run: `grep -n '"harness-reported"' src/studio/run-exec.ts`
Expected: **no matches** (the literal hardcode is removed).
Run: `bun run test`
Expected: green; no studio regressions.

- [ ] **Step 5: Commit**

```bash
git add src/studio/run-exec.ts src/studio/run-exec.test.ts
git commit -m "fix(studio): use costSourceForHarness instead of hardcoding harness-reported"
```

---

### Task 9: End-to-end validation (manual, requires a running Ollama)

**Files:** none (validation only)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Start Ollama and pull the model**

```bash
ollama serve &  # if not already running
ollama pull qwen3-coder
```

- [ ] **Step 2: Probe the profile**

Run: `bun run src/cli.ts model probe ollama-qwen3-coder`
Expected: `✓ probe OK — qwen3-coder present at http://localhost:11434/api/tags`.

- [ ] **Step 3: Run one smoke worker trial (worktree, zero-dependency)**

Run:
```bash
bun run src/cli.ts run --candidates superpowers --trials 1 \
  --provider worktree --harness codex --worker-model ollama-qwen3-coder \
  --judge-model claude-opus-4-8 --trial-minutes 20
```
Expected: the trial builds via `codex exec --oss --local-provider ollama`; the run completes (or caps) without an auth error; provenance records provider `ollama`, the model id, and cost source `tokens-only`.

- [ ] **Step 4: Confirm provenance + cost source**

Run: `bun run src/cli.ts report runs/<run-dir>` then inspect the scorecard / `results.json`.
Expected: worker model `ollama-qwen3-coder` (provider `ollama`); `costSource: "tokens-only"`. Repeat the smoke trial through Studio (`bun run studio`) and confirm it too records `tokens-only` (Task 8).

- [ ] **Step 5: Final suite + spec checkbox sync**

Run: `bun run test` (green) and tick tasks 1.0–1.10 in `openspec/changes/add-local-model-support/tasks.md`. Then:
```bash
git add openspec/changes/add-local-model-support/tasks.md
git commit -m "docs(openspec): mark local-model Phase 1 tasks complete"
```

---

## Self-Review

**Spec coverage (Phase 1 tasks 1.0–1.10):**
- 1.0 Codex pin → Task 0 ✓
- 1.1 authKind none + optional authEnv → Task 1 ✓
- 1.2 ossProvider field → Task 2 ✓
- 1.3 resolveWorkerEnv → Task 3 ✓
- 1.4 plumbing → Task 4 ✓
- 1.5 codex driver --oss → Task 5 ✓
- 1.6 preflight/probe → Task 6 ✓
- 1.7 example profiles → Task 7 ✓
- 1.8 .env + redaction → Task 7 ✓
- 1.85 worker URL behavior → Task 6 (documented decision) ✓
- 1.9 Studio cost-source parity → Task 8 ✓
- 1.10 end-to-end validation → Task 9 ✓

**Type consistency:** `ossProvider: "ollama" | "lmstudio"` is identical across `ModelProfile`, `ResolvedWorker`, `DriverRunOptions`, `SessionScriptOptions`, scheduler dep `workerOssProvider`, and `PrintCliCommandContext` (inherited). `probeLocalEndpoint(profile, fetchFn, env)` signature matches its test and CLI call. `costSourceForHarness(profile, reportsCost)` matches `src/models.ts` and `src/cli.ts:199`.

**Placeholder scan:** no TBD/TODO; every code step shows the code; commands have expected output. Task 9 is intentionally manual (needs a live Ollama) and is labeled as such.
