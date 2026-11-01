/**
 * Task environment builder (design D7, task 3.2).
 *
 * With a committed `uv.lock`: `uv sync --frozen`, reinstalling the project package
 * so generated files (e.g. setuptools-scm's version.py) exist. Without one: a
 * time-capped resolve (`uv pip install --exclude-newer <base commit date>`), the uv
 * analogue of RepoLaunch's time-gated pip proxy. Lessons from the spike:
 * - parallel installs flaked on a laptop network → builds are serialized and
 *   retried on network errors;
 * - Python 3.13 lacks wheels for some 2024–25 pins (dm-tree) → default 3.12;
 * - CMake 4 refuses old `cmake_minimum_required` → CMAKE_POLICY_VERSION_MINIMUM.
 */

import { $ } from "bun";
import { sha256 } from "./bundle";

export interface EnvOptions {
	/** Python version for the venv (default 3.12). */
	python?: string;
	/** The project's distribution name (for `--reinstall-package`). */
	pkg: string;
	/** Extras for the no-lockfile path (e.g. "io,etc"); default "dev". */
	extras?: string;
	/** ISO date: resolve nothing newer (no-lockfile path). */
	excludeNewer: string;
	retries?: number;
}

export interface EnvResult {
	ok: boolean;
	method: "uv.lock" | "exclude-newer";
	log: string;
	/** sha256 of `uv pip freeze` — the environment's identity, recorded per bundle. */
	digest: string | null;
	seconds: number;
}

const NETWORK_RE =
	/error sending request|Failed to fetch|failed after \d+ retries|timed out/i;

let queue: Promise<unknown> = Promise.resolve();
/** Serialize environment builds across concurrent tasks. */
function serialized<T>(fn: () => Promise<T>): Promise<T> {
	const run = queue.then(fn, fn);
	queue = run.catch(() => undefined);
	return run;
}

/** Runs one shell command in the environment directory; host or sandbox. */
export type EnvRunner = (
	command: string,
	env: Record<string, string>,
) => Promise<{ exitCode: number; out: string }>;

/** Shell-quote one argument. */
export const shq = (a: string) => `'${a.replaceAll("'", `'\\''`)}'`;

/** Run commands on the host, in `dir`. */
export function hostRunner(dir: string): EnvRunner {
	return async (command, env) => {
		const r = await $`bash -c ${command}`
			.cwd(dir)
			.env({ ...process.env, ...env })
			.quiet()
			.nothrow();
		return {
			exitCode: r.exitCode,
			out: r.stdout.toString() + r.stderr.toString(),
		};
	};
}

export function buildEnv(dir: string, opts: EnvOptions): Promise<EnvResult> {
	return serialized(() => buildEnvWith(hostRunner(dir), opts));
}

/**
 * The environment build itself, over any runner. The trial-image builder runs it
 * inside a container so trials get the same recipe validation used.
 */
export async function buildEnvWith(
	run: EnvRunner,
	opts: EnvOptions,
): Promise<EnvResult> {
	const t0 = Date.now();
	const py = opts.python ?? "3.12";
	const hasLock = (await run("test -f uv.lock", {})).exitCode === 0;
	const env = { UV_PYTHON: py, CMAKE_POLICY_VERSION_MINIMUM: "3.5" };
	const attempt = async (): Promise<{ ok: boolean; log: string }> => {
		if (hasLock) {
			for (const extra of ["--all-extras --all-groups", "--all-groups", ""]) {
				const r = await run(
					`uv sync --frozen ${extra} --reinstall-package ${shq(opts.pkg)}`,
					env,
				);
				if (r.exitCode === 0) return { ok: true, log: r.out };
				if (extra === "") return { ok: false, log: r.out };
			}
		}
		await run(`rm -rf .venv && uv venv -q --python ${shq(py)}`, env);
		const spec = shq(`.[${opts.extras ?? "dev"}]`);
		const tries = [
			`-e ${spec} --group dev pytest pytest-timeout pytest-asyncio`,
			`-e ${spec} pytest pytest-timeout pytest-asyncio hypothesis`,
			"-e . pytest pytest-timeout pytest-asyncio hypothesis",
		];
		let log = "";
		for (const t of tries) {
			const r = await run(
				`uv pip install -q --exclude-newer ${shq(opts.excludeNewer)} ${t}`,
				env,
			);
			log += r.out;
			if (r.exitCode === 0) return { ok: true, log };
		}
		return { ok: false, log };
	};

	let res = await attempt();
	for (
		let i = 1;
		!res.ok && i < (opts.retries ?? 3) && NETWORK_RE.test(res.log);
		i++
	) {
		await Bun.sleep(10_000 * i);
		res = await attempt();
	}
	let digest: string | null = null;
	if (res.ok) {
		// pytest-timeout keeps a hung test from hanging the whole validation.
		await run("uv pip install -q pytest-timeout", env);
		const freeze = await run("uv pip freeze 2>/dev/null", env);
		digest = sha256(freeze.out);
	}
	return {
		ok: res.ok,
		method: hasLock ? "uv.lock" : "exclude-newer",
		log: res.log,
		digest,
		seconds: Math.round((Date.now() - t0) / 1000),
	};
}
