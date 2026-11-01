/**
 * Brownfield workspace seeding (add-brownfield-track, design D6/D7; tasks 4.2/4.7).
 *
 * A trial workspace starts as the task's sealed base repository on a fresh branch,
 * in the task's prebuilt environment, with the issue file in the root. The sealed
 * repo is built once per (repo, base) and cached under `runs/.cache` — never
 * re-fetched, and each trial gets its own copy so trials cannot observe each
 * other's changes.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import type { BrownfieldTrialTask } from "../orchestrator/scheduler";
import type { Sandbox } from "../providers/types";
import { buildEnv, type EnvResult } from "./env";
import { buildSealedRepo, verifySealed } from "./seal";

export class BrownfieldSeedError extends Error {}

/** Branch every trial works on; the base commit is its merge-base. */
export const TRIAL_BRANCH = "trial-work";

/** Files the trial environment adds that must never appear in a candidate patch. */
const NON_CANDIDATE_PATHS = [
	".venv",
	".pytest_cache",
	"__pycache__",
	".ruff_cache",
];
export interface SealedRepoOptions {
	clone: string;
	baseSha: string;
	/** Commits that must be absent (merge commit, fix commits). */
	futureShas?: string[];
	cacheRoot?: string;
	repoDir: string;
}

/**
 * Return a verified sealed repo for `baseSha`, building it into the cache on
 * first use. A cache entry that fails `verifySealed` is rebuilt, never trusted.
 */
export async function ensureSealedRepo(
	opts: SealedRepoOptions,
): Promise<string> {
	const root = opts.cacheRoot ?? join("runs", ".cache", "sealed");
	const dir = join(root, opts.repoDir, opts.baseSha.slice(0, 12));
	if (existsSync(dir)) {
		const problems = await verifySealed(
			dir,
			opts.baseSha,
			opts.futureShas ?? [],
		);
		if (problems.length === 0) return dir;
		rmSync(dir, { recursive: true, force: true });
	}
	mkdirSync(join(dir, ".."), { recursive: true });
	await buildSealedRepo(opts.clone, opts.baseSha, dir);
	const problems = await verifySealed(dir, opts.baseSha, opts.futureShas ?? []);
	if (problems.length)
		throw new BrownfieldSeedError(
			`sealed repo at ${dir} is not sealed: ${problems.join("; ")}`,
		);
	return dir;
}

/**
 * Seed the sandbox workspace: sealed repo contents, a fresh branch, local git
 * identity (the trial's HOME has no global git config), and the issue file.
 */
export async function seedWorkspace(
	sandbox: Sandbox,
	task: BrownfieldTrialTask,
	sealedDir: string,
): Promise<void> {
	if (!sandbox.copyIn)
		throw new BrownfieldSeedError(
			`provider ${sandbox.id.split(":")[0]} has no copyIn; brownfield runs need the worktree or docker provider`,
		);
	await sandbox.copyIn(sealedDir, sandbox.workspacePath);
	const ws = JSON.stringify(sandbox.workspacePath);
	const res = await sandbox.exec(
		[
			`git -C ${ws} checkout -q -B ${TRIAL_BRANCH}`,
			`git -C ${ws} config user.email trial@harness-eval.local`,
			`git -C ${ws} config user.name "harness-eval trial"`,
			// Keep environment artifacts out of the candidate's diff without touching
			// the repository's own tracked ignore file (info/exclude is local-only).
			`mkdir -p ${ws}/.git/info`,
			`printf '%s\\n' ${NON_CANDIDATE_PATHS.map((p) => `"${p}/"`).join(" ")} >> ${ws}/.git/info/exclude`,
			`git -C ${ws} rev-parse HEAD`,
		].join("\n"),
		{ timeoutMs: 5 * 60_000 },
	);
	if (res.exitCode !== 0)
		throw new BrownfieldSeedError(
			`seeding failed in ${sandbox.workspacePath}: ${res.stderr.slice(0, 400)}`,
		);
	const head = res.stdout.trim().split("\n").at(-1) ?? "";
	if (
		!head.startsWith(task.baseSha.slice(0, 7)) &&
		!task.baseSha.startsWith(head)
	)
		throw new BrownfieldSeedError(
			`workspace HEAD ${head.slice(0, 12)} is not the task base ${task.baseSha.slice(0, 12)}`,
		);
	await sandbox.writeFile(
		join(sandbox.workspacePath, task.issueFile),
		task.issueContent,
	);
}

/** `[project] name` from a workspace `pyproject.toml` (the package uv reinstalls). */
export function projectName(dir: string): string | null {
	const p = join(dir, "pyproject.toml");
	if (!existsSync(p)) return null;
	const lines = readFileSync(p, "utf8").split("\n");
	const start = lines.findIndex((l) => /^\s*\[project\]\s*$/.test(l));
	if (start < 0) return null;
	for (const line of lines.slice(start + 1)) {
		if (/^\s*\[/.test(line)) break; // next table
		const m = /^\s*name\s*=\s*["']([^"']+)["']/.exec(line);
		if (m?.[1]) return m[1];
	}
	return null;
}

/**
 * Build the task environment inside the trial workspace. Runs before the agent
 * session so the worker starts in a working, offline-testable environment — the
 * same environment validation used (design D7).
 */
export async function buildWorkspaceEnv(
	workspacePath: string,
	opts: { python?: string; excludeNewer: string; pkg?: string | null },
): Promise<EnvResult> {
	const pkg = opts.pkg ?? projectName(workspacePath);
	if (!pkg)
		throw new BrownfieldSeedError(
			`cannot build environment: no [project] name in ${join(workspacePath, "pyproject.toml")}`,
		);
	return buildEnv(workspacePath, {
		pkg,
		python: opts.python,
		excludeNewer: opts.excludeNewer,
	});
}

export interface PatchCapture {
	/** Unified diff of the candidate's change against the base commit (may be empty). */
	patch: string;
	/** `git status --porcelain` at capture time, for provenance/debugging. */
	status: string;
	/** Files touched by the candidate (from the diff), sorted. */
	files: string[];
}

/**
 * Capture the candidate's change as a patch against the base commit. Task 4.7:
 * the trial is graded from this patch, not from whatever happens to be in the
 * archived workspace. Trial-environment artifacts are excluded by pathspec so a
 * `.venv` never becomes part of a candidate's diff.
 */
export async function captureCandidatePatch(
	sandbox: Sandbox,
	task: BrownfieldTrialTask,
): Promise<PatchCapture> {
	const ws = JSON.stringify(sandbox.workspacePath);
	// Only the injected issue file is excluded explicitly; environment artifacts are
	// covered by `.git/info/exclude` (see seedWorkspace) so no pathspec ever names an
	// ignored path (git add rejects that).
	const excludes = `':!${task.issueFile}'`;
	const add = await sandbox.exec(`git -C ${ws} add -A -- . ${excludes}`, {
		timeoutMs: 10 * 60_000,
	});
	if (add.exitCode !== 0)
		throw new BrownfieldSeedError(
			`patch capture (git add) failed: ${add.stderr.slice(0, 400)}`,
		);
	const status = await sandbox.exec(
		`git -C ${ws} status --porcelain=v1 --untracked-files=all`,
	);
	const diff = await sandbox.exec(
		`git -C ${ws} diff --cached --binary --full-index ${task.baseSha} -- . ${excludes}`,
		{ timeoutMs: 10 * 60_000 },
	);
	if (diff.exitCode !== 0)
		throw new BrownfieldSeedError(
			`patch capture (git diff) failed: ${diff.stderr.slice(0, 400)}`,
		);
	const files = [
		...new Set(
			[...diff.stdout.matchAll(/^diff --git a\/(\S+) b\//gm)].map(
				(m) => m[1] ?? "",
			),
		),
	]
		.filter(Boolean)
		.sort();
	return { patch: diff.stdout, status: status.stdout, files };
}

/** Persist a captured patch beside the trial's other artifacts. */
export function writePatchCapture(
	trialDir: string,
	capture: PatchCapture,
): string {
	mkdirSync(trialDir, { recursive: true });
	const p = join(trialDir, "candidate.patch");
	writeFileSync(p, capture.patch);
	writeFileSync(join(trialDir, "candidate.status"), capture.status);
	return p;
}

/** Base commit date (for the no-lockfile resolve path), from a checkout. */
export async function commitDate(dir: string): Promise<string> {
	return (await $`git -C ${dir} show -s --format=%cI HEAD`.text()).trim();
}
