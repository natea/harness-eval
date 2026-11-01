/**
 * Solution-reach audit (task 5.3, design D14): did the worker obtain the upstream
 * fix from anywhere other than the repository at its base commit? Runs over the
 * redacted transcripts; any positive hit disqualifies the trial.
 */
import { readFileSync } from "node:fs";

export type AuditVerdict =
	| "clean"
	| "disqualified:solution-reach"
	| "attempted";

export interface AuditFinding {
	kind: "future-sha" | "pull-request" | "network" | "web-tool";
	evidence: string;
}

export interface AuditResult {
	verdict: AuditVerdict;
	findings: AuditFinding[];
	/** Network/tool attempts that did not (in the transcript) retrieve anything. */
	attempts: AuditFinding[];
}

const NETWORK_CMD_RE =
	/\b(curl|wget|git\s+(fetch|pull|clone|ls-remote)|pip\s+download|npm\s+(view|pack)|gh\s+(pr|api|issue|search))\b/;
const WEB_TOOL_RE = /"(WebSearch|WebFetch|web_search|web_fetch)"/;
const PR_URL_RE = /github\.com\/([\w.-]+\/[\w.-]+)\/(pull|issues)\/\d+/i;

/**
 * Text the worker actually emitted (assistant tool calls), not content it read.
 * Repository files often quote the project's own issue URLs; only fetching them
 * counts as reaching. Falls back to the whole text for non-JSON transcripts.
 */
export function actionText(text: string): string {
	const actions: string[] = [];
	let sawTranscript = false;
	for (const line of text.split("\n")) {
		if (!line.trim().startsWith("{")) continue;
		let obj: { type?: string; message?: { content?: unknown } };
		try {
			obj = JSON.parse(line) as typeof obj;
		} catch {
			continue;
		}
		if (!obj.type) continue;
		sawTranscript = true;
		if (obj.type !== "assistant") continue;
		const content = obj.message?.content;
		if (!Array.isArray(content)) continue;
		for (const c of content) {
			const block = c as { type?: string; name?: string; input?: unknown };
			if (block.type === "tool_use")
				actions.push(JSON.stringify({ name: block.name, input: block.input }));
		}
	}
	if (sawTranscript) return actions.join("\n");
	return text;
}

/** Audit one trial's transcript text. */
export function auditTranscript(
	text: string,
	opts: { futureShas?: string[]; prNumber?: number; repo?: string },
): AuditResult {
	const findings: AuditFinding[] = [];
	const attempts: AuditFinding[] = [];
	const lines = actionText(text).split("\n");

	const shaPrefixes = (opts.futureShas ?? [])
		.filter((s) => s.length >= 7)
		.map((s) => s.slice(0, 8).toLowerCase());
	if (shaPrefixes.length) {
		for (const line of lines) {
			const low = line.toLowerCase();
			const hit = shaPrefixes.find((p) => low.includes(p));
			if (hit) findings.push({ kind: "future-sha", evidence: hit });
		}
	}

	const prRe = opts.prNumber
		? new RegExp(`(^|[^\\d])${opts.prNumber}([^\\d]|$)`)
		: null;
	for (const line of lines) {
		const urls = [...line.matchAll(new RegExp(PR_URL_RE.source, "gi"))];
		// Only this project's PRs/issues are the future; a dependency's upstream
		// (e.g. litellm) is legitimate reference material.
		for (const u of urls) {
			const slug = u[1]?.toLowerCase();
			if (!opts.repo || slug === opts.repo.toLowerCase())
				findings.push({ kind: "pull-request", evidence: u[0] });
		}
		if (urls.length) continue;
		// A bare PR number is only evidence together with a repository reference.
		if (prRe && opts.repo && line.includes(opts.repo) && prRe.test(line))
			findings.push({
				kind: "pull-request",
				evidence: line.trim().slice(0, 160),
			});
		if (WEB_TOOL_RE.test(line)) {
			findings.push({ kind: "web-tool", evidence: line.trim().slice(0, 160) });
			continue;
		}
		if (NETWORK_CMD_RE.test(line)) {
			attempts.push({ kind: "network", evidence: line.trim().slice(0, 160) });
		}
	}

	const dedupe = (xs: AuditFinding[]) => [
		...new Map(xs.map((f) => [`${f.kind}:${f.evidence}`, f])).values(),
	];
	const found = dedupe(findings);
	const verdict: AuditVerdict = found.length
		? "disqualified:solution-reach"
		: attempts.length
			? "attempted"
			: "clean";
	return { verdict, findings: found, attempts: dedupe(attempts) };
}

/** Audit a set of transcript files. */
export function auditFiles(
	paths: string[],
	opts: { futureShas?: string[]; prNumber?: number; repo?: string },
): AuditResult {
	const merged = paths.map((p) => readFileSync(p, "utf8")).join("\n");
	return auditTranscript(merged, opts);
}
