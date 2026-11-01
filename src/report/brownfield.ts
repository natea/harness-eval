/**
 * Brownfield run report (task 5.4, eval-reporting spec): resolution by
 * candidate, stratified by body leak level, with agent time/USD beside the human
 * baseline. Claims are limited to what the run measured.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadBundle } from "../brownfield/bundle";
import type { RunResults } from "../types";

const pct = (n: number, d: number) =>
	d === 0 ? "—" : `${Math.round((100 * n) / d)}%`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const minutes = (ms: number) => `${(ms / 60000).toFixed(1)}m`;

interface TaskInfo {
	leakBody: string;
	humanMinutes: number | null;
	humanRounds: number | null;
	humanDiffLines: number | null;
}

function taskInfo(repoDir: string, taskId: string): TaskInfo | null {
	const dir = join("brownfield", repoDir, "tasks", taskId);
	if (!existsSync(dir)) return null;
	try {
		const b = loadBundle(dir, { verify: false });
		const h = b.manifest.humanBaseline;
		return {
			leakBody: b.manifest.leak?.body ?? "unknown",
			humanMinutes: h ? h.codingWindowMinutes + h.reviewMinutes : null,
			humanRounds: h ? h.reviewRounds : null,
			humanDiffLines: h
				? h.humanDiff.linesAdded + h.humanDiff.linesRemoved
				: null,
		};
	} catch {
		return null;
	}
}

/** Write `brownfield.md` next to the run's other artifacts; returns its path. */
export function writeBrownfieldReport(
	runDir: string,
	results: RunResults,
): string {
	const path = join(runDir, "brownfield.md");
	writeFileSync(path, renderBrownfieldReport(results));
	return path;
}

export function renderBrownfieldReport(results: RunResults): string {
	const trials = results.trials.filter((t) => t.provenance.brownfield);
	const info = new Map(
		trials.map((t) => {
			const b = t.provenance.brownfield!;
			return [t.provenance.trialId, taskInfo(b.repoDir, b.taskId)];
		}),
	);

	const lines: string[] = [];
	lines.push(`# Brownfield report — ${results.runId}`, "");
	const workerModels = [
		...new Set(trials.map((t) => t.provenance.model ?? "unknown")),
	];
	lines.push(
		`Model: ${workerModels.join(", ")} · provider: ${results.trials[0]?.provenance.provider ?? "unknown"} · trials: ${trials.length}`,
		"",
		"Contamination flags apply per worker model; a trial disqualified for solution reach is counted as unresolved, not resolved.",
		"",
	);

	// Resolution by candidate.
	const candidates = [...new Set(trials.map((t) => t.provenance.candidate))];
	lines.push("## Resolution by candidate", "");
	lines.push(
		"| Candidate | Tasks | Resolved | Resolved excl. cassette-miss | Unresolved | Cassette-miss | Agent time (resolved) | USD (resolved) | USD/resolved |",
	);
	lines.push("| --- | --: | --: | --: | --: | --: | --: | --: | --: |");
	for (const c of candidates) {
		const ts = trials.filter((t) => t.provenance.candidate === c);
		const resolved = ts.filter((t) => t.resolution?.verdict === "resolved");
		const cassette = ts.filter(
			(t) => (t.resolution?.cassetteMiss.length ?? 0) > 0,
		);
		const ms = resolved.reduce(
			(n, t) => n + (t.telemetry?.agentDurationMs ?? 0),
			0,
		);
		const cost = resolved.reduce(
			(n, t) => n + (t.telemetry?.totalCostUsd ?? 0),
			0,
		);
		const clean = ts.filter(
			(t) =>
				(t.resolution?.cassetteMiss.length ?? 0) === 0 &&
				t.resolution?.verdict === "resolved",
		);
		const cleanPool = ts.filter(
			(t) => (t.resolution?.cassetteMiss.length ?? 0) === 0,
		);
		lines.push(
			`| ${c} | ${ts.length} | ${resolved.length} (${pct(resolved.length, ts.length)}) | ${clean.length} (${pct(clean.length, cleanPool.length)}) | ${ts.length - resolved.length} | ${cassette.length} | ${minutes(ms)} | ${usd(cost)} | ${resolved.length ? usd(cost / resolved.length) : "—"} |`,
		);
	}
	lines.push("");

	// Resolution stratified by body leak level.
	lines.push("## Resolution by body leak level", "");
	lines.push("| Body leak | Trials | Resolved |");
	lines.push("| --- | --: | --: |");
	const leaks = [
		...new Set(
			trials.map((t) => info.get(t.provenance.trialId)?.leakBody ?? "unknown"),
		),
	];
	for (const leak of leaks) {
		const ts = trials.filter(
			(t) => (info.get(t.provenance.trialId)?.leakBody ?? "unknown") === leak,
		);
		const resolved = ts.filter((t) => t.resolution?.verdict === "resolved");
		lines.push(
			`| ${leak} | ${ts.length} | ${resolved.length} (${pct(resolved.length, ts.length)}) |`,
		);
	}
	lines.push("");

	// Per-trial detail, human baseline beside the agent.
	lines.push("## Trials", "");
	lines.push(
		"| Candidate | Task | Variant | Verdict | Reason | Agent time | USD | Human time | Human rounds |",
	);
	lines.push("| --- | --- | --- | --- | --- | --: | --: | --: | --: |");
	for (const t of trials) {
		const b = t.provenance.brownfield!;
		const ti = info.get(t.provenance.trialId);
		lines.push(
			`| ${t.provenance.candidate} | ${b.taskId} | ${b.variant} | ${t.resolution?.verdict ?? "not graded"} | ${t.resolution?.reason ?? "—"} | ${minutes(t.telemetry?.agentDurationMs ?? 0)} | ${usd(t.telemetry?.totalCostUsd ?? 0)} | ${ti?.humanMinutes != null ? `${ti.humanMinutes.toFixed(0)}m` : "—"} | ${ti?.humanRounds ?? "—"} |`,
		);
	}
	lines.push("");

	// Rejections and cassette misses, so neither is hidden inside the totals.
	const rejected = trials.filter((t) => t.resolution?.verdict === "unresolved");
	if (rejected.length) {
		lines.push("## Unresolved by reason", "");
		const reasons = new Map<string, number>();
		for (const t of rejected)
			reasons.set(
				t.resolution?.reason ?? "unknown",
				(reasons.get(t.resolution?.reason ?? "unknown") ?? 0) + 1,
			);
		for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1]))
			lines.push(`- ${reason}: ${n}`);
		lines.push("");
	}
	const cassette = trials.filter(
		(t) => (t.resolution?.cassetteMiss.length ?? 0) > 0,
	);
	if (cassette.length) {
		lines.push("## Cassette misses (excluded from resolution counts)", "");
		for (const t of cassette)
			lines.push(
				`- ${t.provenance.candidate} ${t.provenance.brownfield!.taskId}: ${t.resolution!.cassetteMiss.join(", ")}`,
			);
		lines.push("");
	}

	const judged = trials.filter((t) => t.judge);
	if (judged.length) {
		const models = [...new Set(judged.map((t) => t.judge!.model))].join(", ");
		lines.push(
			`## Judge signal (${models}; blind to the hidden tests)`,
			"",
			"| Candidate | Task | Quality | Resolves issue | Notes |",
			"| --- | --- | --- | --- | --- |",
		);
		for (const t of judged) {
			lines.push(
				`| ${t.provenance.candidate} | ${t.provenance.brownfield!.taskId} | ${t.judge!.quality} | ${t.judge!.resolvesIssue ? "yes" : "no"} | ${t.judge!.notes.replace(/\|/g, "/").slice(0, 120)} |`,
			);
		}
		lines.push("");
	}

	lines.push(
		"Human baseline is the recorded human coding + review time for the same task at merge time; it is shown beside the agent, not as a counterfactual.",
		"",
	);
	return lines.join("\n");
}
