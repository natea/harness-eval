/**
 * Brownfield task bundles (add-brownfield-track, design D2).
 *
 * A bundle is the frozen unit of a brownfield task, the brownfield analogue of a
 * PRD target: an issue reconstructed at T*, the sealed reference and test patches,
 * validation results and leak labels, all hashed in `task.yaml`. Runs record the
 * bundle hashes and refuse to dispatch on a mismatch. Human review labels live in
 * `review/labels.jsonl`, which is append-only and deliberately outside the hash set
 * (labels accrue after freezing; they must not invalidate the bundle).
 *
 * Layout: brownfield/<owner>__<repo>/tasks/<task-id>/   (task-id = pr<PR>-issue<N>)
 */
import { createHash } from "node:crypto";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";

export const BROWNFIELD_ROOT = "brownfield";
export const MANIFEST_FILE = "task.yaml";
export const REVIEW_DIR = "review";
export const LABELS_FILE = join(REVIEW_DIR, "labels.jsonl");

/** Leak scale, lowest to highest (design D9). Order matters: index = severity. */
export const LEAK_LEVELS = [
	"noise",
	"symptom",
	"diagnosis",
	"fix_sketch",
	"fix_code",
] as const;
export const LeakLevel = z.enum(LEAK_LEVELS);
export type LeakLevel = z.infer<typeof LeakLevel>;

export const ISSUE_VARIANTS = ["body", "body+human", "body+all"] as const;
export type IssueVariant = (typeof ISSUE_VARIANTS)[number];

export const FAIRNESS = ["yes", "no", "unsure"] as const;

const IsoDate = z.string().min(10);

export const TaskManifest = z.object({
	schemaVersion: z.literal(1),
	/** `owner/repo` on GitHub. */
	repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
	pr: z.number().int().positive(),
	issues: z.array(z.number().int().positive()).min(1),
	baseSha: z.string().min(7),
	mergeSha: z.string().min(7),
	tStar: IsoDate,
	issueCreatedAt: IsoDate,
	prMergedAt: IsoDate,
	verdict: z.string(),
	failToPass: z.array(z.string()),
	passToPass: z.array(z.string()),
	envBroken: z.array(z.string()),
	flaky: z.array(z.string()),
	testPaths: z.array(z.string()),
	depsTouched: z.boolean().default(false),
	/** Provider endpoints/models the app may reach during trials; empty = fixtures only (D7). */
	appEgress: z.array(z.string()).default([]),
	leak: z.object({
		body: LeakLevel.nullable(),
		comments: LeakLevel.nullable(),
	}),
	/** T* signal (prCreated / firstPrCommit / firstXref). */
	cutBy: z.string().optional(),
	/** Environment the validation ran in (D7): build method and `uv pip freeze` digest. */
	env: z
		.object({
			method: z.string(),
			digest: z.string().nullable(),
			python: z.string(),
			/** Distribution name and extras, so grading can rebuild the same environment. */
			pkg: z.string().optional(),
			extras: z.string().optional(),
		})
		.optional(),
	/** Which tests validation ran: PR-touched only, or the full suite under testPaths. */
	validationSelection: z.enum(["touched", "full"]).optional(),
	/** Original PR baseline timings (D16). */
	humanBaseline: z
		.object({
			codingWindowMinutes: z.number(),
			reviewMinutes: z.number(),
			reviewRounds: z.number(),
			commitsAfterFirstReview: z.number(),
			issueLifetimeMinutes: z.number(),
			humanDiff: z.object({
				linesAdded: z.number(),
				linesRemoved: z.number(),
				filesTouched: z.number(),
			}),
		})
		.optional(),
	/** Imported from spike data, not yet produced by the full miner. */
	provisional: z.boolean().default(false),
	/** sha256 of every bundle file except task.yaml and review/ (relative path → hex). */
	files: z.record(z.string(), z.string().length(64)),
});
export type TaskManifest = z.infer<typeof TaskManifest>;

export const SnapshotComment = z.object({
	at: IsoDate,
	author: z.string(),
	isBot: z.boolean().default(false),
	assoc: z.string().optional(),
	/** Author role relative to the task (issue author, future fixer, maintainer, other, bot). */
	role: z.string().optional(),
	text: z.string(),
	source: z.string().optional(),
});
export const Snapshot = z.object({
	pr: z.number().int(),
	issue: z.number().int(),
	tStar: IsoDate,
	title: z.string(),
	issueAuthor: z.string(),
	body: z.string(),
	comments: z.array(SnapshotComment),
	/** Items whose edit history failed the self-check (D4); recorded, never trusted silently. */
	selfCheckFailures: z.array(z.string()).optional(),
	/** Image URLs that could not be bundled (left as links). */
	imagesFailed: z.array(z.string()).optional(),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const LeakItem = z.object({
	id: z.string(),
	label: LeakLevel,
	consistent_with_reference: z.boolean(),
	reveals_files: z.array(z.string()),
	evidence: z.string(),
	rationale: z.string(),
	author: z.string().optional(),
	role: z.string().optional(),
});
export const LeakLabels = z.object({
	model: z.string(),
	items: z.array(LeakItem),
	bodyLevel: LeakLevel.optional(),
	commentsLevel: LeakLevel.optional(),
	/** sha256 of the classifier's system prompt + schema (stale-prompt detection). */
	promptHash: z.string().optional(),
	costUsd: z.number().optional(),
});
export type LeakLabels = z.infer<typeof LeakLabels>;

export const ReviewRecord = z.object({
	reviewer: z.string().min(1),
	at: IsoDate,
	/** One leak level per issue item: `body`, `c1`, `c2`, … */
	items: z.array(z.object({ id: z.string(), label: LeakLevel })).min(1),
	fairness: z.object({
		verdict: z.enum(FAIRNESS),
		note: z.string().default(""),
	}),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

export class BundleError extends Error {}

export interface Bundle {
	dir: string;
	/** `<owner>__<repo>` directory name. */
	repoDir: string;
	id: string;
	manifest: TaskManifest;
}

export function taskId(pr: number, issue: number): string {
	return `pr${pr}-issue${issue}`;
}

export function repoDirName(repo: string): string {
	return repo.replace("/", "__");
}

export function sha256(buf: Buffer | string): string {
	return createHash("sha256").update(buf).digest("hex");
}

/** Every hashed file in a bundle: all files except the manifest and review/. */
function hashedFiles(dir: string): string[] {
	const out: string[] = [];
	const walk = (d: string) => {
		for (const name of readdirSync(d)) {
			const p = join(d, name);
			const rel = relative(dir, p);
			if (rel === MANIFEST_FILE || rel === REVIEW_DIR) continue;
			if (statSync(p).isDirectory()) walk(p);
			else out.push(rel);
		}
	};
	walk(dir);
	return out.sort();
}

/** Hash the bundle's files (byte-exact) for the manifest's `files` map. */
export function computeFileHashes(dir: string): Record<string, string> {
	return Object.fromEntries(
		hashedFiles(dir).map((rel) => [rel, sha256(readFileSync(join(dir, rel)))]),
	);
}

/** Write task.yaml with fresh file hashes. The manifest's `files` is overwritten. */
export function writeManifest(
	dir: string,
	manifest: Omit<TaskManifest, "files">,
): TaskManifest {
	const full = TaskManifest.parse({
		...manifest,
		files: computeFileHashes(dir),
	});
	writeFileSync(join(dir, MANIFEST_FILE), stringify(full));
	return full;
}

/** Files whose content no longer matches the manifest, plus missing and unexpected files. */
export function verifyBundle(dir: string, manifest: TaskManifest): string[] {
	const problems: string[] = [];
	const actual = computeFileHashes(dir);
	for (const [rel, want] of Object.entries(manifest.files)) {
		if (!(rel in actual)) problems.push(`missing: ${rel}`);
		else if (actual[rel] !== want) problems.push(`hash mismatch: ${rel}`);
	}
	for (const rel of Object.keys(actual))
		if (!(rel in manifest.files)) problems.push(`unexpected: ${rel}`);
	return problems;
}

/** Load and (by default) hash-verify one bundle. Throws BundleError naming the files. */
export function loadBundle(
	dir: string,
	opts: { verify?: boolean } = {},
): Bundle {
	const mpath = join(dir, MANIFEST_FILE);
	if (!existsSync(mpath)) throw new BundleError(`${dir}: no ${MANIFEST_FILE}`);
	const parsed = TaskManifest.safeParse(parse(readFileSync(mpath, "utf8")));
	if (!parsed.success)
		throw new BundleError(
			`${dir}: invalid ${MANIFEST_FILE}: ${parsed.error.message}`,
		);
	if (opts.verify !== false) {
		const problems = verifyBundle(dir, parsed.data);
		if (problems.length)
			throw new BundleError(
				`${dir}: bundle hash check failed: ${problems.join("; ")}`,
			);
	}
	const parts = dir.split(/[\\/]/).filter(Boolean);
	return {
		dir,
		repoDir: parts.at(-3) ?? "",
		id: parts.at(-1) ?? "",
		manifest: parsed.data,
	};
}

/** All bundle directories under the brownfield root (brownfield/<repo>/tasks/<id>). */
export function listBundleDirs(root = BROWNFIELD_ROOT): string[] {
	if (!existsSync(root)) return [];
	const out: string[] = [];
	for (const repoDir of readdirSync(root).sort()) {
		const tasks = join(root, repoDir, "tasks");
		if (!existsSync(tasks) || !statSync(tasks).isDirectory()) continue;
		for (const id of readdirSync(tasks).sort()) {
			const d = join(tasks, id);
			if (existsSync(join(d, MANIFEST_FILE))) out.push(d);
		}
	}
	return out;
}

export function bundleDir(
	repoDir: string,
	id: string,
	root = BROWNFIELD_ROOT,
): string {
	if (!/^[\w.-]+__[\w.-]+$/.test(repoDir) || !/^pr\d+-issue\d+$/.test(id))
		throw new BundleError(`invalid bundle reference: ${repoDir}/${id}`);
	return join(root, repoDir, "tasks", id);
}

export function readSnapshot(dir: string): Snapshot {
	return Snapshot.parse(
		JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf8")),
	);
}

export function readLeaks(dir: string): LeakLabels | null {
	const p = join(dir, "leaks.json");
	return existsSync(p)
		? LeakLabels.parse(JSON.parse(readFileSync(p, "utf8")))
		: null;
}

export function readText(dir: string, rel: string): string | null {
	const p = join(dir, rel);
	return existsSync(p) ? readFileSync(p, "utf8") : null;
}

// ---- Review labels (append-only) ----

export function readReviews(dir: string): ReviewRecord[] {
	const p = join(dir, LABELS_FILE);
	if (!existsSync(p)) return [];
	return readFileSync(p, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => ReviewRecord.parse(JSON.parse(l)));
}

/** Issue item ids a review must label: `body` plus one per retained comment. */
export function itemIds(snapshot: Snapshot): string[] {
	return ["body", ...snapshot.comments.map((_, i) => `c${i + 1}`)];
}

/**
 * Append one review record. Validates it covers exactly the bundle's issue items.
 * Never rewrites the file: an O_APPEND write of one line, so earlier records are
 * untouched and no hashed bundle file changes.
 */
export function appendReview(dir: string, record: unknown): ReviewRecord {
	const rec = ReviewRecord.parse(record);
	const want = itemIds(readSnapshot(dir));
	const got = rec.items.map((i) => i.id);
	const missing = want.filter((id) => !got.includes(id));
	const extra = got.filter((id) => !want.includes(id));
	if (missing.length || extra.length || new Set(got).size !== got.length)
		throw new BundleError(
			`review must label each item exactly once (missing: ${missing.join(",") || "none"}; unknown: ${extra.join(",") || "none"})`,
		);
	mkdirSync(join(dir, REVIEW_DIR), { recursive: true });
	appendFileSync(join(dir, LABELS_FILE), `${JSON.stringify(rec)}\n`);
	return rec;
}

// ---- Issue variants (what the worker sees) ----

/**
 * Remove links that point at the fix: the fixing PR, and commit links at the merge
 * SHA. Earlier PRs, issues and commits are legitimate context and stay.
 */
export function stripFutureLinks(
	text: string,
	repo: string,
	pr: number,
	mergeSha: string,
): string {
	const r = repo.replace(/[.]/g, "\\.");
	const prUrl = new RegExp(
		`https?://github\\.com/${r}/pull/${pr}\\b[^\\s)\\]]*`,
		"g",
	);
	const sha7 = mergeSha.slice(0, 7);
	const commitUrl = new RegExp(
		`https?://github\\.com/${r}/commit/${sha7}[0-9a-f]*[^\\s)\\]]*`,
		"g",
	);
	return text
		.replace(prUrl, "[link removed]")
		.replace(commitUrl, "[link removed]")
		.replace(new RegExp(`(^|[^\\w/])#${pr}\\b`, "g"), "$1#[removed]");
}

export function renderIssueVariant(
	snap: Snapshot,
	variant: IssueVariant,
	ctx: { repo: string; mergeSha: string },
): string {
	const clean = (t: string) =>
		stripFutureLinks(t.trim(), ctx.repo, snap.pr, ctx.mergeSha);
	const header = `# ${snap.title}\n\n_Opened by @${snap.issueAuthor}_\n\n${clean(snap.body)}\n`;
	if (variant === "body") return header;
	const comments = snap.comments.filter(
		(c) => variant === "body+all" || !c.isBot,
	);
	if (!comments.length) return header;
	return `${header}\n---\n\n## Discussion\n\n${comments
		.map(
			(c) =>
				`**@${c.author}**${c.isBot ? " (bot)" : ""} (${c.at.slice(0, 10)}):\n\n${clean(c.text)}\n`,
		)
		.join("\n")}`;
}
