/**
 * Hidden-test grading (grading-rubric; task 5.1).
 *
 * In a fresh sealed repo at the base commit: apply the candidate's patch, restore
 * test infrastructure to base (flagging any candidate edits), apply the hidden
 * test patch, and run the same test selection validation used. Resolved = every
 * FAIL_TO_PASS and PASS_TO_PASS test passes, with no cassette-miss.
 *
 * `selfCheck` grades the reference patch (must resolve) and an empty patch (must
 * not), so a broken task is caught before any agent spend.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { type Bundle, readText } from "./bundle";
import { buildEnv } from "./env";
import { buildSealedRepo } from "./seal";
import { type Outcome, runPytest } from "./testrun";

const PYTEST_CONFIG_FILES = new Set(["pytest.ini", "tox.ini", "setup.cfg"]);

async function git(dir: string, args: string[]) {
	const r = await $`git -C ${dir} ${args}`.quiet().nothrow();
	return {
		code: r.exitCode,
		out: r.stdout.toString(),
		err: r.stderr.toString(),
	};
}

/** Is this path test infrastructure for a bundle with these test paths? */
export function isTestInfra(path: string, testPaths: string[]): boolean {
	if (testPaths.some((t) => path === t || path.startsWith(`${t}/`)))
		return true;
	const name = path.split("/").at(-1) ?? "";
	return name === "conftest.py" || PYTEST_CONFIG_FILES.has(name);
}

/** The `[tool.pytest…]` sections of a pyproject.toml, as text (empty when absent). */
export function pytestSections(toml: string): string {
	const out: string[] = [];
	let keep = false;
	for (const line of toml.split("\n")) {
		if (/^\s*\[/.test(line)) keep = /^\s*\[tool\.pytest/.test(line);
		if (keep) out.push(line);
	}
	return out.join("\n").trim();
}

/** Replace the candidate's `[tool.pytest…]` sections with base's, keeping everything else. */
export function restorePytestSections(candidate: string, base: string): string {
	const baseSection = pytestSections(base);
	const kept: string[] = [];
	let skip = false;
	for (const line of candidate.split("\n")) {
		if (/^\s*\[/.test(line)) skip = /^\s*\[tool\.pytest/.test(line);
		if (!skip) kept.push(line);
	}
	const body = kept.join("\n").replace(/\s+$/, "");
	return baseSection ? `${body}\n\n${baseSection}\n` : `${body}\n`;
}

/**
 * Restore test infrastructure in `repo` to `baseSha`; returns the paths the
 * candidate had modified (flag `test-infra-modified`).
 */
export async function restoreTestInfra(
	repo: string,
	baseSha: string,
	testPaths: string[],
): Promise<string[]> {
	await git(repo, ["add", "-A"]);
	const changed = (
		await git(repo, ["diff", "--cached", "--name-status", baseSha])
	).out
		.split("\n")
		.filter(Boolean)
		.map((l) => {
			const [status, ...rest] = l.split("\t");
			return { status: status ?? "", path: rest.at(-1) ?? "" };
		});
	const flagged: string[] = [];
	for (const { status, path } of changed) {
		if (path === "pyproject.toml") {
			const base = (await git(repo, ["show", `${baseSha}:pyproject.toml`])).out;
			const cand = readFileSync(join(repo, path), "utf8");
			if (pytestSections(cand) !== pytestSections(base)) {
				writeFileSync(join(repo, path), restorePytestSections(cand, base));
				flagged.push(`${path} [tool.pytest]`);
			}
			continue;
		}
		if (!isTestInfra(path, testPaths)) continue;
		flagged.push(path);
		if (status.startsWith("A")) rmSync(join(repo, path), { force: true });
		else await git(repo, ["checkout", baseSha, "--", path]);
	}
	await git(repo, ["reset", "-q"]);
	return flagged;
}

export interface Scored {
	resolved: boolean;
	failToPass: Record<string, Outcome | "missing">;
	passToPass: Record<string, Outcome | "missing">;
	/** Scored tests that failed on a missing recording (offline proxy or vcrpy replay-only). */
	cassetteMiss: string[];
}

/** Resolution over the bundle's scored tests; env-broken and flaky tests are never scored. */
export function scoreOutcomes(
	outcomes: Record<string, Outcome> | null,
	failToPass: string[],
	passToPass: string[],
): Scored {
	const pick = (ids: string[]) =>
		Object.fromEntries(
			ids.map((id) => [id, outcomes?.[id] ?? ("missing" as const)]),
		);
	const f2p = pick(failToPass);
	const p2p = pick(passToPass);
	const all = { ...f2p, ...p2p };
	const cassetteMiss = Object.entries(all)
		.filter(([, o]) => o === "fail-live")
		.map(([id]) => id);
	const resolved =
		outcomes !== null &&
		failToPass.length > 0 &&
		Object.values(all).every((o) => o === "pass") &&
		cassetteMiss.length === 0;
	return { resolved, failToPass: f2p, passToPass: p2p, cassetteMiss };
}

export interface GradeResult extends Scored {
	patchApplied: boolean;
	testInfraModified: string[];
	/** True when the trial needs human review (test-infra edits or cassette misses). */
	flaggedForReview: boolean;
	envOk: boolean;
}

export interface GradeOptions {
	clone: string;
	workDir: string;
	/** Override the bundle's recorded env (needed for provisional bundles). */
	pkg?: string;
	extras?: string;
	python?: string;
}

/** Test targets validation used, so junit ids line up: touched node ids, or [] for the full suite. */
function validationTargets(bundle: Bundle): string[] {
	const v = JSON.parse(readText(bundle.dir, "validation.json") ?? "{}");
	return (v.targets ?? v.selected ?? []) as string[];
}

export async function gradeCandidate(
	bundle: Bundle,
	candidatePatch: string,
	opts: GradeOptions,
): Promise<GradeResult> {
	const m = bundle.manifest;
	const workDir = resolve(opts.workDir);
	rmSync(workDir, { recursive: true, force: true });
	const repo = join(workDir, "repo");
	const logs = join(workDir, "logs");
	mkdirSync(logs, { recursive: true });
	const fail = (extra: Partial<GradeResult>): GradeResult => ({
		...scoreOutcomes(null, m.failToPass, m.passToPass),
		patchApplied: false,
		testInfraModified: [],
		flaggedForReview: false,
		envOk: false,
		...extra,
	});

	await buildSealedRepo(opts.clone, m.baseSha, repo);
	const pkg = opts.pkg ?? m.env?.pkg;
	if (!pkg)
		throw new Error(`${bundle.id}: no package name recorded; pass --pkg`);
	const date = (
		await git(repo, ["show", "-s", "--format=%cI", "HEAD"])
	).out.trim();
	const env = await buildEnv(repo, {
		pkg,
		extras: opts.extras ?? m.env?.extras,
		python: opts.python ?? m.env?.python,
		excludeNewer: date,
	});
	writeFileSync(join(logs, "env.log"), env.log);
	if (!env.ok) return fail({ envOk: false });

	const cp = join(workDir, "candidate.patch");
	writeFileSync(cp, candidatePatch);
	if (
		candidatePatch.trim() &&
		(await git(repo, ["apply", "--binary", cp])).code !== 0
	)
		return fail({ envOk: true });

	const testInfraModified = await restoreTestInfra(
		repo,
		m.baseSha,
		m.testPaths,
	);
	const tp = join(workDir, "tests.patch");
	writeFileSync(tp, readText(bundle.dir, "tests.patch") ?? "");
	if ((await git(repo, ["apply", "--binary", tp])).code !== 0)
		return fail({ envOk: true, patchApplied: true, testInfraModified });

	const outcomes = await runPytest(repo, {
		targets: validationTargets(bundle),
		junitPath: join(logs, "grade.xml"),
		logPath: join(logs, "grade.log"),
	});
	const scored = scoreOutcomes(outcomes, m.failToPass, m.passToPass);
	return {
		...scored,
		patchApplied: true,
		testInfraModified,
		flaggedForReview:
			testInfraModified.length > 0 || scored.cassetteMiss.length > 0,
		envOk: true,
	};
}

export interface SelfCheck {
	ok: boolean;
	reference: GradeResult;
	empty: GradeResult;
}

/** The grader checked against itself: reference must resolve, empty patch must not. */
export async function selfCheck(
	bundle: Bundle,
	opts: GradeOptions,
): Promise<SelfCheck> {
	const refPatch = readText(bundle.dir, "reference.patch") ?? "";
	const reference = await gradeCandidate(bundle, refPatch, {
		...opts,
		workDir: join(opts.workDir, "reference"),
	});
	const empty = await gradeCandidate(bundle, "", {
		...opts,
		workDir: join(opts.workDir, "empty"),
	});
	return { ok: reference.resolved && !empty.resolved, reference, empty };
}
