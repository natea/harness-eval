/**
 * Brownfield run configuration (add-brownfield-track, design D1; task 4.1).
 *
 * A brownfield run replaces the PRD target with a set of frozen task bundles and
 * one issue variant. Everything else — providers, drivers, telemetry, budgets,
 * reporting — is the existing machinery: this module only resolves *what* runs
 * and *what the worker sees*.
 *
 * Selection is strict: bundles are hash-verified on load (never re-fetched), only
 * accepted (`VALID`) tasks are eligible, and a run refuses to start when the
 * bundle's leak classifier is the run's worker model (design D9).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrownfieldTrialTask, TrialPlan } from "../orchestrator/scheduler";
import type { CandidateEntry } from "../types";
import {
	BROWNFIELD_ROOT,
	type Bundle,
	ISSUE_VARIANTS,
	type IssueVariant,
	listBundleDirs,
	loadBundle,
	readLeaks,
	repoDirName,
	sha256,
} from "./bundle";
import { assertClassifierIndependent } from "./classify";

export class BrownfieldRunError extends Error {}

/** Task ids are `pr<PR>-issue<N>`; rejected early so a typo never picks a task. */
const TASK_ID_RE = /^pr\d+-issue\d+$/;

export interface BrownfieldSpec {
	/** `owner/repo` on GitHub. */
	repo: string;
	/** Task ids (`pr<PR>-issue<N>`) or `all` for every accepted task of the repo. */
	tasks: string[] | "all";
	variant: IssueVariant;
}

export interface ParseSpecInput {
	repo?: string;
	tasks?: string;
	variant?: string;
}

/**
 * Parse the CLI surface: `--brownfield <owner/repo> --tasks <ids|all> --variant
 * body|body+human|body+all`. `--variant` defaults to `body`.
 */
export function parseBrownfieldSpec(input: ParseSpecInput): BrownfieldSpec {
	const repo = input.repo?.trim();
	if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
		throw new BrownfieldRunError(
			`--brownfield must be an owner/name repository (e.g. Future-House/paper-qa), got '${input.repo ?? ""}'`,
		);
	}
	const variant = (input.variant?.trim() || "body") as IssueVariant;
	if (!ISSUE_VARIANTS.includes(variant)) {
		throw new BrownfieldRunError(
			`--variant must be one of ${ISSUE_VARIANTS.join("|")}, got '${input.variant}'`,
		);
	}
	const raw = input.tasks?.trim();
	if (!raw) {
		throw new BrownfieldRunError(
			"--tasks is required for a brownfield run: a comma-separated list of task ids, or 'all'",
		);
	}
	if (raw === "all") return { repo, tasks: "all", variant };
	const tasks = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (!tasks.length) throw new BrownfieldRunError("--tasks listed no task ids");
	for (const id of tasks) {
		if (!TASK_ID_RE.test(id))
			throw new BrownfieldRunError(
				`invalid task id '${id}': expected pr<PR>-issue<N> (e.g. pr1311-issue1310)`,
			);
	}
	return { repo, tasks, variant };
}

/** A task is runnable only when validation accepted it. */
export function isAccepted(b: Bundle): boolean {
	return b.manifest.verdict === "VALID";
}

/**
 * Resolve the run's task bundles. Every bundle is hash-verified by `loadBundle`
 * (a tampered bundle fails before any trial is dispatched, naming the file).
 * `all` returns every accepted task of the repo, sorted by id.
 */
export function selectBrownfieldTasks(
	spec: BrownfieldSpec,
	opts: { root?: string; verify?: boolean } = {},
): Bundle[] {
	const root = opts.root ?? BROWNFIELD_ROOT;
	const repoDir = repoDirName(spec.repo);
	const dirs = listBundleDirs(root).filter(
		(d) => d.split(/[\\/]/).at(-3) === repoDir,
	);
	if (!dirs.length)
		throw new BrownfieldRunError(
			`no task bundles for ${spec.repo} under ${join(root, repoDir, "tasks")}`,
		);
	const bundles = dirs.map((d) => loadBundle(d, { verify: opts.verify }));
	if (spec.tasks === "all")
		return bundles.filter(isAccepted).sort((a, b) => a.id.localeCompare(b.id));

	const byId = new Map(bundles.map((b) => [b.id, b]));
	const missing = spec.tasks.filter((id) => !byId.has(id));
	if (missing.length)
		throw new BrownfieldRunError(
			`unknown task id(s) for ${spec.repo}: ${missing.join(", ")}`,
		);
	const rejected = spec.tasks.filter(
		(id) => !isAccepted(byId.get(id) as Bundle),
	);
	if (rejected.length)
		throw new BrownfieldRunError(
			`task(s) not eligible for runs (verdict is not VALID): ${rejected
				.map((id) => `${id} (${(byId.get(id) as Bundle).manifest.verdict})`)
				.join(", ")}`,
		);
	return spec.tasks.map((id) => byId.get(id) as Bundle);
}

/** Identity recorded in provenance: the exact frozen bundle a trial ran. */
export interface BrownfieldTaskRef {
	repoDir: string;
	taskId: string;
	variant: IssueVariant;
	/** sha256 of the bundle manifest, which itself hashes every bundle file. */
	bundleSha256: string;
	baseSha: string;
	/** Merge commit of the reference fix (must be absent from the sealed repo). */
	mergeSha: string;
}

export function taskRef(b: Bundle, variant: IssueVariant): BrownfieldTaskRef {
	return {
		repoDir: b.repoDir,
		taskId: b.id,
		variant,
		bundleSha256: bundleHash(b),
		baseSha: b.manifest.baseSha,
		mergeSha: b.manifest.mergeSha,
	};
}

/** sha256 of `task.yaml` — covers every file hash the manifest records. */
export function bundleHash(b: Bundle): string {
	return sha256(readFileSync(join(b.dir, "task.yaml")));
}

/**
 * Refuse tasks whose leak labels came from this run's worker model (design D9).
 * Tasks without labels are allowed; they simply carry no leak stratum.
 */
export function assertTasksClassifierIndependent(
	tasks: Bundle[],
	workerModel: string,
): void {
	for (const b of tasks) {
		const model = readLeaks(b.dir)?.model;
		if (model) assertClassifierIndependent(model, workerModel);
	}
}

/** Convenience for a run-level identity: sha256 over the sorted bundle hashes. */
export function taskSetHash(tasks: Bundle[]): string {
	return sha256(
		tasks
			.map((b) => bundleHash(b))
			.sort()
			.join("\n"),
	);
}

/**
 * One trial per (task, candidate). Trial ids stay unique and readable:
 * `<candidate>-<taskId>` (e.g. `superpowers-pr1311-issue1310`).
 */
export function buildBrownfieldMatrix(
	candidates: CandidateEntry[],
	tasks: BrownfieldTrialTask[],
): TrialPlan[] {
	const plans: TrialPlan[] = [];
	for (const [ti, task] of tasks.entries()) {
		for (const candidate of candidates) {
			plans.push({
				trialId: `${candidate.id}-${task.taskId}`,
				candidate,
				trialIndex: ti,
				task,
			});
		}
	}
	return plans;
}
