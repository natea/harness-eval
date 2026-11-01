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
const PR_URL_RE = /github\.com\/[\w.-]+\/[\w.-]+\/(pull|issues)\/\d+/i;

/** Audit one trial's transcript text. */
export function auditTranscript(
	text: string,
	opts: { futureShas?: string[]; prNumber?: number; repo?: string },
): AuditResult {
	const findings: AuditFinding[] = [];
	const attempts: AuditFinding[] = [];
	const lines = text.split("\n");

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
		const url = PR_URL_RE.exec(line);
		if (url) {
			// A PR/issue URL for a different project is not the future for THIS task.
			const sameRepo = opts.repo
				? line.includes(`github.com/${opts.repo}/`)
				: true;
			if (sameRepo) findings.push({ kind: "pull-request", evidence: url[0] });
			continue;
		}
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

	// Dedupe by kind+evidence.
	const dedupe = (xs: AuditFinding[]) => [
		...new Map(xs.map((f) => [`${f.kind}:${f.evidence}`, f])).values(),
	];
	const found = dedupe(findings);
	const verdict: AuditVerdict = found.some(
		(f) => f.kind === "future-sha" || f.kind === "pull-request",
	)
		? "disqualified:solution-reach"
		: found.some((f) => f.kind === "web-tool")
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
