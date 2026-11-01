/**
 * FAIL_TO_PASS validation (design D5, D8, D17; tasks 3.4, 3.7 classification, 3.8).
 *
 * In a sealed repo at the base commit: build the environment, apply the PR's test
 * hunks and run (before), then apply the reference hunks and run twice (gold).
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { buildEnv, type EnvOptions, type EnvResult } from "./env";
import { buildSealedRepo, verifySealed } from "./seal";
import { type Outcome, runPytest, touchedTests } from "./testrun";

export type Verdict =
	| "VALID"
	| "fail:no-fail-to-pass"
	| "fail:gold-regression"
	| "fail:needs-live-api"
	| "fail:needs-gpu"
	| "fail:dependency-change"
	| "fail:pytest-crashed"
	| "fail:env-build"
	| "fail:patch-apply"
	| "fail:seal";

export interface Classification {
	verdict: Verdict;
	failToPass: string[];
	passToPass: string[];
	flaky: string[];
	envBroken: string[];
	/** env-broken tests whose failure was a blocked/unauthenticated provider call. */
	liveApi: string[];
	/** Passed before, fail under the reference patch. */
	goldRegress: string[];
	/** Skipped for missing GPU hardware/libraries in the gold runs. */
	gpuSkipped: string[];
}

const failed = (o: Outcome | undefined) => o === "fail" || o === "fail-live";

/**
 * Classify per-test outcomes (D8) and pick the verdict (D5). A test missing from
 * the before run counts as failing there (e.g. its module didn't import yet).
 */
export function classifyRuns(
	before: Record<string, Outcome> | null,
	gold1: Record<string, Outcome> | null,
	gold2: Record<string, Outcome> | null,
	opts: { depsTouched: boolean },
): Classification {
	const empty: Classification = {
		verdict: "fail:pytest-crashed",
		failToPass: [],
		passToPass: [],
		flaky: [],
		envBroken: [],
		liveApi: [],
		goldRegress: [],
		gpuSkipped: [],
	};
	if (!gold1 || !gold2)
		return {
			...empty,
			verdict: opts.depsTouched
				? "fail:dependency-change"
				: "fail:pytest-crashed",
		};
	if (!before) return empty;
	const ids = new Set([
		...Object.keys(before),
		...Object.keys(gold1),
		...Object.keys(gold2),
	]);
	const c = { ...empty };
	for (const id of ids) {
		const b = before[id];
		const g1 = gold1[id];
		const g2 = gold2[id];
		const pass1 = g1 === "pass";
		const pass2 = g2 === "pass";
		if (g1 === "skip-gpu" || g2 === "skip-gpu") c.gpuSkipped.push(id);
		else if (pass1 !== pass2 || failed(g1) !== failed(g2)) c.flaky.push(id);
		else if (pass1 && b === "pass") c.passToPass.push(id);
		else if (pass1) c.failToPass.push(id);
		else if (failed(g1) && b === "pass") c.goldRegress.push(id);
		else if (failed(g1)) {
			c.envBroken.push(id);
			if (g1 === "fail-live" || g2 === "fail-live") c.liveApi.push(id);
		}
	}
	c.verdict = c.goldRegress.length
		? "fail:gold-regression"
		: c.failToPass.length
			? "VALID"
			: c.liveApi.length
				? "fail:needs-live-api"
				: c.gpuSkipped.length
					? "fail:needs-gpu"
					: "fail:no-fail-to-pass";
	return c;
}

export interface ValidateInput {
	clone: string;
	baseSha: string;
	mergeSha: string;
	/** All commits of the PR (must be absent from the sealed repo). */
	futureShas: string[];
	testsPatch: string;
	referencePatch: string;
	depsTouched: boolean;
	/** Where to build the sealed repo and write logs (must not exist or be empty). */
	workDir: string;
	env: Omit<EnvOptions, "excludeNewer">;
	/** `touched` runs only the PR-touched tests; `full` the whole suite under testPaths. */
	selection: "touched" | "full";
	testPaths: string[];
}

export interface ValidationResult extends Classification {
	selection: "touched" | "full";
	targets: string[];
	env: Omit<EnvResult, "log"> | null;
	sealProblems: string[];
}

export async function validateTask(
	input: ValidateInput,
): Promise<ValidationResult> {
	// Absolute: git -C <repo> resolves relative patch paths against the repo, not cwd.
	const workDir = resolve(input.workDir);
	// The work dir is this validation's own scratch space; start clean so a re-run
	// isn't refused by the sealed-repo builder's empty-destination guard.
	rmSync(workDir, { recursive: true, force: true });
	const repoDir = join(workDir, "repo");
	const logs = join(workDir, "logs");
	mkdirSync(logs, { recursive: true });
	const base = (
		verdict: Verdict,
		extra: Partial<ValidationResult> = {},
	): ValidationResult => ({
		...classifyRuns(null, null, null, { depsTouched: false }),
		verdict,
		selection: input.selection,
		targets: [],
		env: null,
		sealProblems: [],
		...extra,
	});

	await buildSealedRepo(input.clone, input.baseSha, repoDir);
	const sealProblems = await verifySealed(repoDir, input.baseSha, [
		input.mergeSha,
		...input.futureShas,
	]);
	if (sealProblems.length) return base("fail:seal", { sealProblems });

	const date = (
		await $`git -C ${repoDir} show -s --format=%cI HEAD`.text()
	).trim();
	const envRes = await buildEnv(repoDir, { ...input.env, excludeNewer: date });
	writeFileSync(join(logs, "env.log"), envRes.log);
	const { log: _log, ...env } = envRes;
	if (!envRes.ok) return base("fail:env-build", { env });

	const tp = join(workDir, "tests.patch");
	const rp = join(workDir, "reference.patch");
	writeFileSync(tp, input.testsPatch);
	writeFileSync(rp, input.referencePatch);
	const apply = async (p: string) =>
		(await $`git -C ${repoDir} apply --binary ${p}`.quiet().nothrow())
			.exitCode === 0;
	if (!(await apply(tp))) return base("fail:patch-apply", { env });

	// `full` = the project's own collection (plain `pytest` honoring its configured
	// testpaths), not every test dir at once: workspace packages have their own
	// tests/ and extra deps, and passing them together collides module names.
	const targets =
		input.selection === "full"
			? []
			: ((await touchedTests(repoDir, tp)) ?? input.testPaths);
	const run = (tag: string) =>
		runPytest(repoDir, {
			targets,
			junitPath: join(logs, `${tag}.xml`),
			logPath: join(logs, `${tag}.log`),
		});

	const before = await run("before");
	if (!(await apply(rp))) return base("fail:patch-apply", { env, targets });
	const gold1 = await run("gold1");
	const gold2 = await run("gold2");
	return {
		...classifyRuns(before, gold1, gold2, { depsTouched: input.depsTouched }),
		selection: input.selection,
		targets,
		env,
		sealProblems,
	};
}
