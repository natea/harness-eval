/**
 * Issue reconstruction at T* (design D3, D4). Pure functions over the GraphQL
 * shapes in github.ts, so they're tested on recorded responses.
 */
import { createHash } from "node:crypto";
import type { Edit, GhIssue, GhPullRequest } from "./github";

export type CutSignal = "prCreated" | "firstPrCommit" | "firstXref";

export interface Cutoff {
	/** One second before the earliest fix-start signal: content at or before this is kept. */
	cut: string;
	/** The earliest signal itself. */
	tStar: string;
	cutBy: CutSignal;
	signals: Partial<Record<CutSignal, string>>;
}

/**
 * T* = min(PR created, earliest author/committer date over PR commits, first
 * cross-reference or connection from the PR on the issue); cut = T* − 1s.
 * Commit dates are client-supplied, so both author and committer dates count.
 */
export function computeCutoff(pr: GhPullRequest, issue: GhIssue): Cutoff {
	const signals: Partial<Record<CutSignal, string>> = {
		prCreated: pr.createdAt,
	};
	const commitTimes = pr.commits.nodes
		.flatMap((n) => [n.commit.authoredDate, n.commit.committedDate])
		.sort();
	if (commitTimes[0]) signals.firstPrCommit = commitTimes[0];
	const xrefs = issue.timelineItems.nodes
		.filter(
			(e) =>
				(e.__typename === "CrossReferencedEvent" &&
					e.source?.number === pr.number) ||
				(e.__typename === "ConnectedEvent" && e.subject?.number === pr.number),
		)
		.map((e) => e.createdAt)
		.filter((t): t is string => Boolean(t))
		.sort();
	if (xrefs[0]) signals.firstXref = xrefs[0];
	const [cutBy, tStar] = (
		Object.entries(signals) as [CutSignal, string][]
	).sort((a, b) => a[1].localeCompare(b[1]))[0] as [CutSignal, string];
	return {
		cut: new Date(Date.parse(tStar) - 1000).toISOString(),
		tStar,
		cutBy,
		signals,
	};
}

/** D5: an issue opened after work on the fix began is a fixer's note, not a task. */
export function issueOpenedAfterFixStart(issue: GhIssue, c: Cutoff): boolean {
	return issue.createdAt >= c.tStar;
}

export interface TextAt {
	text: string;
	/** Where the text came from: `no-edits`, `edit@<time>`, or `original`. */
	source: string;
	editedAfter: number;
	/** Self-check (D4): the newest edit equals the live text; null when there are no edits. */
	selfCheckOk: boolean | null;
}

/**
 * Text as of `cut`. Edit nodes hold the full post-edit text (verified on the
 * spike); the oldest node is the original. With no edits the live text is the
 * original.
 */
export function textAt(live: string, edits: Edit[], cut: string): TextAt {
	const usable = edits
		.filter((e) => e.diff != null)
		.sort((a, b) => a.editedAt.localeCompare(b.editedAt));
	const editedAfter = edits.filter((e) => e.editedAt > cut).length;
	if (!usable.length)
		return { text: live, source: "no-edits", editedAfter, selfCheckOk: null };
	const newest = usable.at(-1) as Edit;
	const selfCheckOk = (newest.diff ?? "").trim() === (live ?? "").trim();
	const before = usable.filter((e) => e.editedAt <= cut);
	if (before.length) {
		const e = before.at(-1) as Edit;
		return {
			text: e.diff ?? "",
			source: `edit@${e.editedAt}`,
			editedAfter,
			selfCheckOk,
		};
	}
	return {
		text: (usable[0] as Edit).diff ?? "",
		source: "original",
		editedAfter,
		selfCheckOk,
	};
}

export interface ReconstructedComment {
	at: string;
	author: string;
	isBot: boolean;
	assoc?: string;
	text: string;
	source: string;
	editedAfter: number;
}

export interface Reconstruction {
	title: string;
	body: string;
	bodySource: string;
	bodyEditedAfter: number;
	labels: string[];
	assignees: string[];
	milestone: string | null;
	state: "OPEN" | "CLOSED";
	comments: ReconstructedComment[];
	droppedComments: number;
	/** Items whose edit history failed the self-check (D4); never silently trusted. */
	selfCheckFailures: string[];
}

/** Replay title, metadata, body and comments to `cut` (D4). */
export function reconstructIssue(issue: GhIssue, cut: string): Reconstruction {
	const events = [...issue.timelineItems.nodes]
		.filter((e) => e.createdAt)
		.sort((a, b) =>
			(a.createdAt as string).localeCompare(b.createdAt as string),
		);

	let title = issue.title;
	const renames = events.filter((e) => e.__typename === "RenamedTitleEvent");
	if (renames.length) {
		const before = renames.filter((r) => (r.createdAt as string) <= cut);
		title = before.length
			? (before.at(-1)?.currentTitle ?? title)
			: (renames[0]?.previousTitle ?? title);
	}

	const labels = new Set<string>();
	const assignees = new Set<string>();
	let milestone: string | null = null;
	let state: "OPEN" | "CLOSED" = "OPEN";
	for (const e of events) {
		if ((e.createdAt as string) > cut) break;
		if (e.__typename === "LabeledEvent" && e.label) labels.add(e.label.name);
		else if (e.__typename === "UnlabeledEvent" && e.label)
			labels.delete(e.label.name);
		else if (e.__typename === "AssignedEvent" && e.assignee?.login)
			assignees.add(e.assignee.login);
		else if (e.__typename === "UnassignedEvent" && e.assignee?.login)
			assignees.delete(e.assignee.login);
		else if (e.__typename === "MilestonedEvent")
			milestone = e.milestoneTitle ?? null;
		else if (e.__typename === "DemilestonedEvent") milestone = null;
		else if (e.__typename === "ClosedEvent") state = "CLOSED";
		else if (e.__typename === "ReopenedEvent") state = "OPEN";
	}

	const selfCheckFailures: string[] = [];
	const body = textAt(issue.body ?? "", issue.userContentEdits.nodes, cut);
	if (body.selfCheckOk === false) selfCheckFailures.push("body");

	const kept = issue.comments.nodes.filter((c) => c.createdAt <= cut);
	const comments = kept.map((c, i) => {
		const t = textAt(c.body ?? "", c.userContentEdits.nodes, cut);
		if (t.selfCheckOk === false) selfCheckFailures.push(`c${i + 1}`);
		return {
			at: c.createdAt,
			author: c.author?.login ?? "ghost",
			isBot:
				c.author?.__typename === "Bot" ||
				/\[bot\]$/.test(c.author?.login ?? ""),
			assoc: c.authorAssociation,
			text: t.text,
			source: t.source,
			editedAfter: t.editedAfter,
		};
	});

	return {
		title,
		body: body.text,
		bodySource: body.source,
		bodyEditedAfter: body.editedAfter,
		labels: [...labels],
		assignees: [...assignees],
		milestone,
		state,
		comments,
		droppedComments: issue.comments.nodes.length - kept.length,
		selfCheckFailures,
	};
}

// ---- Images (stored in the bundle; the sandbox has no network) ----

const IMG_RE =
	/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|<img[^>]+src=["'](https?:\/\/[^"']+)["']/g;

export function imageUrls(text: string): string[] {
	const out = new Set<string>();
	for (const m of text.matchAll(IMG_RE)) {
		const u = m[1] ?? m[2];
		if (u) out.add(u);
	}
	return [...out];
}

export type Fetcher = (
	url: string,
) => Promise<{ ok: boolean; contentType: string; bytes: Uint8Array }>;

export const httpFetcher: Fetcher = async (url) => {
	const r = await fetch(url, { redirect: "follow" });
	return {
		ok: r.ok,
		contentType: r.headers.get("content-type") ?? "",
		bytes: new Uint8Array(await r.arrayBuffer()),
	};
};

const EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
};

/**
 * Download every image referenced in `texts`. Returns url → bundle-relative path
 * (`issue/assets/<sha12>.<ext>`) plus the bytes to write. Failed downloads are
 * reported, not fatal: the link is left as-is and recorded.
 */
export async function collectImages(
	texts: string[],
	fetcher: Fetcher = httpFetcher,
): Promise<{
	assets: Map<string, { path: string; bytes: Uint8Array }>;
	failed: string[];
}> {
	const assets = new Map<string, { path: string; bytes: Uint8Array }>();
	const failed: string[] = [];
	for (const url of new Set(texts.flatMap(imageUrls))) {
		try {
			const r = await fetcher(url);
			if (!r.ok) throw new Error("http");
			const ext = EXT[r.contentType.split(";")[0]?.trim() ?? ""] ?? "bin";
			const sha = createHash("sha256")
				.update(r.bytes)
				.digest("hex")
				.slice(0, 12);
			assets.set(url, { path: `issue/assets/${sha}.${ext}`, bytes: r.bytes });
		} catch {
			failed.push(url);
		}
	}
	return { assets, failed };
}

/** Point image links at bundled copies (paths relative to the issue/ directory). */
export function rewriteImages(
	text: string,
	assets: Map<string, { path: string }>,
): string {
	let out = text;
	for (const [url, a] of assets)
		out = out.split(url).join(a.path.replace(/^issue\//, ""));
	return out;
}
