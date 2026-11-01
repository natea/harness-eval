/**
 * Offline test runner (design D7, task 3.3).
 *
 * Tests run with no network and no live credentials: recorded HTTP fixtures
 * replay, and a dead proxy makes un-recorded live-API calls fail in seconds
 * instead of retrying until the per-test timeout. pytest's stderr is captured so a
 * crash is never silent (the zarr #4063 lesson).
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

/** Environment for every validation and grading test run. */
export const OFFLINE_TEST_ENV: Record<string, string> = {
	// paper-qa's conftest (pre-2026-10 offline mode) replays cassettes only in CI.
	GITHUB_ACTIONS: "true",
	PQA_OFFLINE_TESTS: "true",
	LITELLM_LOCAL_MODEL_COST_MAP: "true",
	OPENAI_API_KEY: "",
	ANTHROPIC_API_KEY: "",
	GEMINI_API_KEY: "",
	CROSSREF_API_KEY: "",
	SEMANTIC_SCHOLAR_API_KEY: "",
	HTTP_PROXY: "http://127.0.0.1:9",
	HTTPS_PROXY: "http://127.0.0.1:9",
	ALL_PROXY: "http://127.0.0.1:9",
	NO_PROXY: "",
};

/** Host vars a test run may inherit; nothing else from the operator. */
export function hostEnv(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TZ"]) {
		const v = process.env[key];
		if (v !== undefined) out[key] = v;
	}
	return out;
}

/**
 * The offline switches for test commands an agent runs in a trial. No proxy: the
 * egress lock already blocks outside traffic, and a dead proxy would break any
 * `claude` the agent starts itself. No Anthropic keys: they belong to Claude Code.
 */
export const AGENT_TEST_ENV: Record<string, string> = Object.fromEntries(
	Object.entries(OFFLINE_TEST_ENV).filter(
		([k]) => !/PROXY$/.test(k) && k !== "ANTHROPIC_API_KEY",
	),
);

/** Shell script form of `AGENT_TEST_ENV`, for `CLAUDE_ENV_FILE`. */
export function agentTestEnvScript(): string {
	return Object.entries(AGENT_TEST_ENV)
		.map(([k, v]) => `export ${k}='${v}'\n`)
		.join("");
}

export type Outcome = "pass" | "fail" | "fail-live" | "skip" | "skip-gpu";

/** A failure caused by a blocked or unauthenticated network call: the test needs a live API. */
export const LIVE_API_RE =
	/APIConnectionError|ProxyError|ConnectError|ClientConnectorError|AuthenticationError|CannotOverwriteExistingCassetteException|api[_ ]key/i;
/** A skip whose reason is missing GPU hardware or GPU libraries. */
export const GPU_SKIP_RE = /cupy|cuda|\bgpu\b|nvidia/i;

/** Parse pytest junit XML into node id → outcome. */
export function parseJunit(xml: string): Record<string, Outcome> {
	const res: Record<string, Outcome> = {};
	const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
	for (const m of xml.matchAll(re)) {
		const attrs = m[1] ?? "";
		const cls = /classname="([^"]*)"/.exec(attrs)?.[1] ?? "";
		const name = /\bname="([^"]*)"/.exec(attrs)?.[1] ?? "";
		const body = m[3] ?? "";
		const id = `${cls}::${name}`;
		if (/<(failure|error)\b/.test(body))
			res[id] = LIVE_API_RE.test(body) ? "fail-live" : "fail";
		else if (/<skipped\b/.test(body))
			res[id] = GPU_SKIP_RE.test(body) ? "skip-gpu" : "skip";
		else res[id] = "pass";
	}
	return res;
}

export interface RunOptions {
	/** Node ids or paths; empty runs pytest's default collection. */
	targets: string[];
	junitPath: string;
	logPath: string;
	perTestTimeoutSec?: number;
	wallClockMs?: number;
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(-pid, signal);
	} catch {
		// Group already gone.
	}
}

/**
 * Wait for a child spawned with `detached: true` (its own process group). On
 * timeout the whole group gets SIGTERM, then SIGKILL after a grace period. After
 * the child exits, any leftovers in its group (mock servers, workers) are killed
 * too. Returns true if the wall clock fired.
 */
export async function waitWithGroupKill(
	p: { pid: number; exited: Promise<number> },
	wallClockMs: number,
	graceMs = 10_000,
): Promise<boolean> {
	let timedOut = false;
	let hard: ReturnType<typeof setTimeout> | undefined;
	const soft = setTimeout(() => {
		timedOut = true;
		killGroup(p.pid, "SIGTERM");
		hard = setTimeout(() => killGroup(p.pid, "SIGKILL"), graceMs);
	}, wallClockMs);
	await p.exited;
	clearTimeout(soft);
	clearTimeout(hard);
	killGroup(p.pid, "SIGKILL");
	return timedOut;
}

/** Run pytest in a built task environment. Returns null when pytest produced no junit (crash). */
export async function runPytest(
	dir: string,
	opts: RunOptions,
): Promise<Record<string, Outcome> | null> {
	rmSync(opts.junitPath, { force: true });
	const p = Bun.spawn(
		[
			"uv",
			"run",
			"--no-sync",
			"pytest",
			...opts.targets,
			"-p",
			"no:sugar",
			"-p",
			"no:cacheprovider",
			"--timeout",
			String(opts.perTestTimeoutSec ?? 90),
			"-o",
			"addopts=",
			`--junitxml=${opts.junitPath}`,
			"-q",
			"-rs",
			// One unimportable module must not abort the session and hide every other result.
			"--continue-on-collection-errors",
		],
		{
			cwd: dir,
			// Own process group: `uv run` does not forward signals to pytest, so killing
			// uv alone leaves pytest (and any servers it started) running.
			detached: true,
			// Only a curated host env: an ambient var such as AGENT=1 leaks into
			// project settings and invalidates the run (paper-qa pydantic Settings).
			env: { ...hostEnv(), ...OFFLINE_TEST_ENV },
			stdout: Bun.file(opts.logPath),
			stderr: Bun.file(`${opts.logPath}.err`),
		},
	);
	await waitWithGroupKill(p, opts.wallClockMs ?? 30 * 60_000);
	return existsSync(opts.junitPath)
		? parseJunit(readFileSync(opts.junitPath, "utf8"))
		: null;
}

/** Map a test patch to the pytest node ids it touches (Python AST, src/brownfield/touched.py). */
export async function touchedTests(
	dir: string,
	testsPatchPath: string,
): Promise<string[] | null> {
	const r =
		await $`python3 ${join(import.meta.dir, "touched.py")} ${dir} ${testsPatchPath}`
			.quiet()
			.nothrow();
	return r.exitCode === 0
		? (JSON.parse(r.stdout.toString()) as string[])
		: null;
}
