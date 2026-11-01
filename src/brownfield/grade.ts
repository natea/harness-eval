/**
 * Hidden-test grading (task 5.1, design D9/D10).
 *
 * Grade from a pristine sealed base + the candidate's captured patch, so env
 * tampering and test edits cannot leak into the verdict: restore test
 * infrastructure, apply `tests.patch`, run the F2P/P2P set offline, and call the
 * task resolved only when every listed test passes.
 */
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import type { TaskManifest } from "./bundle";
import { buildWorkspaceEnv } from "./seed";
import { type Outcome, parseJunit, runPytest } from "./testrun";

/** Files/dirs whose modification counts as touching test infrastructure. */
const TEST_INFRA_FILES = [
	"conftest.py",
	"pytest.ini",
	"setup.cfg",
	"tox.ini",
	"pyproject.toml",
];
/** A replay-only fixture miss, not a genuine test failure. */
const CASSETTE_RE =
	/CassetteNotFoundError|CannotOverwriteExistingCassetteException|No cassette found|vcrpy/i;

export type GradeVerdict = "resolved" | "unresolved";
export type GradeReason =
	| "candidate-patch-failed"
	| "tests-patch-failed"
	| "env-build-failed"
	| "pytest-crashed"
	| "fail-to-pass"
	| "pass-to-pass"
	| null;

export interface GradeResult {
	verdict: GradeVerdict;
	reason: GradeReason;
	failToPass: Record<string, Outcome | "missing">;
	passToPass: Record<string, Outcome | "missing">;
	/** Candidate patch touched these test-infra paths (restored before grading). */
	testInfraModified: string[];
	/** F2P/P2P tests that fail because a recorded HTTP fixture is missing. */
	cassetteMiss: string[];
	envDigest: string | null;
	logs: { junit: string; log: string; env: string };
}

export interface GradeInput {
	/** Sealed base repo (task's base commit, no future objects). */
	sealedDir: string;
	/** Candidate patch captured at trial end (unified diff against the base). */
	candidatePatch: string;
	manifest: Pick<TaskManifest, "failToPass" | "passToPass" | "testPaths"> & {
		env?: { python?: string } | null;
	};
	testsPatch: string;
	/** Scratch dir; wiped and recreated. */
	workDir: string;
	perTestTimeoutSec?: number;
	wallClockMs?: number;
	/** Injectable for hermetic tests. */
	deps?: {
		buildEnv?: (
			dir: string,
			opts: { python?: string; excludeNewer: string },
		) => Promise<{ ok: boolean; log?: string; digest?: string | null }>;
		runSuite?: typeof runPytest;
	};
}

/** True when `p` is test infrastructure for this task. */
export function isTestInfraPath(p: string, testPaths: string[]): boolean {
	if (TEST_INFRA_FILES.includes(p.split("/").at(-1) ?? "")) return true;
	return testPaths.some(
		(tp) => p === tp || p.startsWith(`${tp.replace(/\/$/, "")}/`),
	);
}

/** `[tool.pytest.ini_options]` body from a pyproject (empty string when absent). */
export function pytestConfig(toml: string): string {
	const lines = toml.split("\n");
	const start = lines.findIndex((l) =>
		/^\s*\[tool\.pytest\.ini_options\]\s*$/.test(l),
	);
	if (start < 0) return "";
	const out: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\s*\[/.test(line)) break;
		out.push(line);
	}
	return out.join("\n").trim();
}

async function git(
	dir: string,
	args: string[],
): Promise<{ code: number; out: string; err: string }> {
	const r = await $`git -C ${dir} ${args}`.quiet().nothrow();
	return {
		code: r.exitCode,
		out: r.stdout.toString().trim(),
		err: r.stderr.toString(),
	};
}

/**
 * Convert a junit id (`pkg.mod.Class::test[param]`) back to a pytest node id
 * (`pkg/mod.py::Class::test[param]`); unknown modules resolve to null.
 */
export function junitToNodeId(dir: string, id: string): string | null {
	const [mod, ...rest] = id.split("::");
	const parts = (mod ?? "").split(".");
	for (let i = parts.length; i >= 1; i--) {
		const file = `${parts.slice(0, i).join("/")}.py`;
		if (existsSync(join(dir, file))) {
			const cls = parts.slice(i);
			return [file, ...cls, ...rest].join("::");
		}
	}
	return null;
}

/** git apply rejects a diff whose last line has no newline. */
function ensureNewline(s: string): string {
	return s.endsWith("\n") || s === "" ? s : `${s}\n`;
}

/** Apply a patch; returns false when it does not apply cleanly. */
async function applyPatch(dir: string, patchPath: string): Promise<boolean> {
	return (
		(await git(dir, ["apply", "--binary", "--whitespace=nowarn", patchPath]))
			.code === 0
	);
}

/** Restore the given paths (and delete candidate additions inside them) from `baseSha`. */
async function restorePaths(
	dir: string,
	baseSha: string,
	paths: string[],
): Promise<void> {
	for (const p of paths) {
		if ((await git(dir, ["cat-file", "-e", `${baseSha}:${p}`])).code === 0)
			await git(dir, ["checkout", baseSha, "--", p]);
	}
	// Candidate additions inside a restored path (new conftest.py, new tests).
	if (paths.length) await git(dir, ["clean", "-fdq", "--", ...paths]);
}

/**
 * Grade one candidate patch. The returned `verdict` is the spec's resolution:
 * every F2P test passes and every P2P test still passes.
 */
export async function gradeCandidate(input: GradeInput): Promise<GradeResult> {
	const workDir = resolve(input.workDir);
	rmSync(workDir, { recursive: true, force: true });
	mkdirSync(workDir, { recursive: true });
	const repo = join(workDir, "repo");
	const logs = join(workDir, "logs");
	mkdirSync(logs, { recursive: true });
	cpSync(input.sealedDir, repo, { recursive: true });

	const result = (
		verdict: GradeVerdict,
		reason: GradeReason,
		extra: Partial<GradeResult> = {},
	): GradeResult => ({
		verdict,
		reason,
		failToPass: {},
		passToPass: {},
		testInfraModified: [],
		cassetteMiss: [],
		envDigest: null,
		logs: {
			junit: join(logs, "junit.xml"),
			log: join(logs, "pytest.log"),
			env: join(logs, "env.log"),
		},
		...extra,
	});

	const baseSha = (await git(repo, ["rev-parse", "HEAD"])).out;
	const patchPath = join(workDir, "candidate.patch");
	writeFileSync(patchPath, ensureNewline(input.candidatePatch));
	if (input.candidatePatch.trim() && !(await applyPatch(repo, patchPath)))
		return result("unresolved", "candidate-patch-failed");

	// Test infrastructure comes from the base, not from the candidate.
	const touched = [
		...(await git(repo, ["diff", "--name-only", baseSha])).out.split("\n"),
		...(
			await git(repo, ["ls-files", "--others", "--exclude-standard"])
		).out.split("\n"),
	].filter(Boolean);
	const testInfraModified = touched
		.filter((p) => isTestInfraPath(p, input.manifest.testPaths))
		.sort();
	// pyproject.toml is restored only when the pytest config itself moved: a
	// legitimate dependency change must survive grading.
	const restore = testInfraModified.filter((p) => {
		if (p !== "pyproject.toml") return true;
		const baseToml = readFileSync(
			join(input.sealedDir, "pyproject.toml"),
			"utf8",
		);
		const candidateToml = existsSync(join(repo, "pyproject.toml"))
			? readFileSync(join(repo, "pyproject.toml"), "utf8")
			: "";
		return pytestConfig(baseToml) !== pytestConfig(candidateToml);
	});
	await restorePaths(repo, baseSha, restore);

	const testsPatchPath = join(workDir, "tests.patch");
	writeFileSync(testsPatchPath, ensureNewline(input.testsPatch));
	if (!(await applyPatch(repo, testsPatchPath)))
		return result("unresolved", "tests-patch-failed");

	const envLog = join(logs, "env.log");
	let digest: string | null = null;
	try {
		const excludeNewer = (
			await git(repo, ["show", "-s", "--format=%cI", "HEAD"])
		).out;
		const build =
			input.deps?.buildEnv ?? ((dir, opts) => buildWorkspaceEnv(dir, opts));
		const env = await build(repo, {
			python: input.manifest.env?.python,
			excludeNewer,
		});
		writeFileSync(envLog, env.log ?? "");
		if (!env.ok)
			return result("unresolved", "env-build-failed", {
				testInfraModified,
				envDigest: null,
			});
		digest = env.digest ?? null;
	} catch (err) {
		writeFileSync(envLog, String(err));
		return result("unresolved", "env-build-failed", { testInfraModified });
	}

	const targets = [...input.manifest.failToPass, ...input.manifest.passToPass]
		.map((id) => junitToNodeId(repo, id))
		.filter((id): id is string => id !== null);
	if (!targets.length)
		return result("unresolved", "pytest-crashed", {
			testInfraModified,
			envDigest: digest,
		});
	const junitPath = join(logs, "junit.xml");
	const logPath = join(logs, "pytest.log");
	const outcomes = await (input.deps?.runSuite ?? runPytest)(repo, {
		targets,
		junitPath,
		logPath,
		perTestTimeoutSec: input.perTestTimeoutSec ?? 120,
		wallClockMs: input.wallClockMs ?? 20 * 60_000,
	});
	if (!outcomes)
		return result("unresolved", "pytest-crashed", {
			testInfraModified,
			envDigest: digest,
		});

	const lookup = (id: string): Outcome | "missing" => outcomes[id] ?? "missing";
	const f2p = Object.fromEntries(
		input.manifest.failToPass.map((id) => [id, lookup(id)]),
	);
	const p2p = Object.fromEntries(
		input.manifest.passToPass.map((id) => [id, lookup(id)]),
	);
	// A blocked network call or replay-only cassette miss is not a code failure.
	const details = existsSync(junitPath)
		? parseJunitDetailed(readFileSync(junitPath, "utf8"))
		: {};
	const cassetteMiss = Object.keys({ ...f2p, ...p2p })
		.filter(
			(id) =>
				details[id]?.outcome === "fail-live" ||
				CASSETTE_RE.test(details[id]?.body ?? ""),
		)
		.sort();

	const f2pOk = input.manifest.failToPass.every((id) => f2p[id] === "pass");
	const p2pOk = input.manifest.passToPass.every((id) => p2p[id] === "pass");
	const reason: GradeReason = !f2pOk
		? "fail-to-pass"
		: !p2pOk
			? "pass-to-pass"
			: null;
	return {
		verdict: f2pOk && p2pOk ? "resolved" : "unresolved",
		reason,
		failToPass: f2p,
		passToPass: p2p,
		testInfraModified,
		cassetteMiss,
		envDigest: digest,
		logs: { junit: junitPath, log: logPath, env: envLog },
	};
}

/** Persist a grade beside the trial's artifacts. */
export function writeGrade(trialDir: string, grade: GradeResult): void {
	mkdirSync(trialDir, { recursive: true });
	writeFileSync(
		join(trialDir, "grade.json"),
		`${JSON.stringify(grade, null, 2)}\n`,
	);
}

/** Parse a junit file without discarding per-test failure bodies (cassette checks). */
export function parseJunitDetailed(
	xml: string,
): Record<string, { outcome: Outcome; body: string }> {
	const out: Record<string, { outcome: Outcome; body: string }> = {};
	for (const [id, o] of Object.entries(parseJunit(xml)))
		out[id] = { outcome: o, body: "" };
	for (const m of xml.matchAll(
		/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g,
	)) {
		const attrs = m[1] ?? "";
		const id = `${/classname="([^"]*)"/.exec(attrs)?.[1] ?? ""}::${/\bname="([^"]*)"/.exec(attrs)?.[1] ?? ""}`;
		if (out[id]) out[id].body = m[3] ?? "";
	}
	return out;
}
