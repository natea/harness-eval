/**
 * Brownfield run report (task 5.4, eval-reporting spec): resolution by
 * candidate, stratified by body leak level, with agent time/USD beside the original PR
 * baseline. Claims are limited to what the run measured.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	activitySummary,
	candidateMarkerPaths,
	trialActivity,
} from "../brownfield/activity";
import { withCorrectedCosts } from "../driver/telemetry";
import { loadBundle } from "../brownfield/bundle";
import {
	originalPrWording,
	QUALITY_FILE,
	type QualityComparison,
} from "../brownfield/quality";
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
	archived: RunResults,
): string {
	const results = {
		...archived,
		trials: archived.trials.map(withCorrectedCosts),
	};
	const path = join(runDir, "brownfield.md");
	const quality = new Map<string, QualityComparison>();
	for (const t of results.trials) {
		const q = join(runDir, "trials", t.provenance.trialId, QUALITY_FILE);
		if (existsSync(q))
			quality.set(t.provenance.trialId, JSON.parse(readFileSync(q, "utf8")));
	}
	const activity = new Map<string, string>();
	for (const t of results.trials) {
		const a = trialActivity(
			join(runDir, "trials", t.provenance.trialId),
			t.provenance.sessionScript.map((x) => x.prompt),
			candidateMarkerPaths(t.provenance.candidate),
		);
		if (a) activity.set(t.provenance.trialId, activitySummary(a));
	}
	writeFileSync(path, renderBrownfieldReport(results, quality, activity));
	return path;
}

export function renderBrownfieldReport(
	results: RunResults,
	quality: Map<string, QualityComparison> = new Map(),
	activity: Map<string, string> = new Map(),
): string {
	const all = results.trials.filter((t) => t.provenance.brownfield);
	// Trials that never got a fair attempt (harness missing, sandbox failure) are
	// not scored; they are listed separately so they can't pass as unresolved.
	const infraFailed = all.filter((t) => t.provenance.status === "infra-failed");
	const trials = all.filter((t) => t.provenance.status !== "infra-failed");
	const info = new Map(
		all.map((t) => {
			const b = t.provenance.brownfield!;
			return [t.provenance.trialId, taskInfo(b.repoDir, b.taskId)];
		}),
	);

	const lines: string[] = [];
	lines.push(`# Brownfield report — ${results.runId}`, "");
	const workerModels = [
		...new Set(all.map((t) => t.provenance.model ?? "unknown")),
	];
	lines.push(
		`Model: ${workerModels.join(", ")} · provider: ${results.trials[0]?.provenance.provider ?? "unknown"} · trials: ${trials.length}`,
		"",
		"Contamination flags apply per worker model; a trial disqualified for solution reach is counted as unresolved, not resolved.",
		"",
	);
	if (infraFailed.length) {
		lines.push(
			`**Not scored — infra-failed: ${infraFailed.length}** (excluded from every table below)`,
			"",
		);
		for (const t of infraFailed)
			lines.push(
				`- ${t.provenance.candidate} × ${t.provenance.brownfield?.taskId}: ${t.provenance.notes[0] ?? "no detail"}`,
			);
		lines.push("");
	}

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

	// Per-trial detail, original PR baseline beside the agent.
	lines.push("## Trials", "");
	lines.push(
		"| Candidate | Task | Variant | Verdict | Reason | Agent time | USD | Original PR time | Original PR review rounds |",
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

	const active = all.filter((t) => activity.has(t.provenance.trialId));
	if (active.length) {
		lines.push(
			"## Harness activity",
			"",
			"Did the trial actually use the framework, or fall back to plain Claude Code? Read from the session log: framework skills the model invoked and framework commands the session ran.",
			"",
			"| Candidate | Task | Activity |",
			"| --- | --- | --- |",
		);
		for (const t of active)
			lines.push(
				`| ${t.provenance.candidate} | ${t.provenance.brownfield!.taskId} | ${activity.get(t.provenance.trialId)!.replace(/\|/g, "/")} |`,
			);
		lines.push("");
	}

	const compared = trials.filter((t) => quality.has(t.provenance.trialId));
	if (compared.length) {
		const first = quality.get(compared[0]!.provenance.trialId)!;
		lines.push(
			`## Code quality vs the original PR (${first.judgeModel}, ${first.samples} samples)`,
			"",
			"Blind comparison: the judge sees the harness's diff and the original PR's diff (fix + tests) labelled only A and B, with sides alternating across samples. Scores are 0–100 (mean of per-criterion medians × 10). This is a secondary signal; it never changes the resolution verdict.",
			"",
			"| Candidate | Task | Harness | Original PR | Preferred (harness/original/tie votes) |",
			"| --- | --- | --: | --: | --- |",
		);
		for (const t of compared) {
			const q = quality.get(t.provenance.trialId)!;
			lines.push(
				`| ${t.provenance.candidate} | ${t.provenance.brownfield!.taskId} | ${q.harnessScore} | ${q.humanScore} | **${q.preference === "human" ? "original PR" : q.preference}** (${q.votes.harness}/${q.votes.human}/${q.votes.tie}) |`,
			);
		}
		lines.push("");
		for (const t of compared) {
			const q = quality.get(t.provenance.trialId)!;
			lines.push(
				`### ${t.provenance.candidate} × ${t.provenance.brownfield!.taskId}`,
				"",
				"| Criterion | Harness | Original PR | Judge's note |",
				"| --- | --: | --: | --- |",
				...q.criteria.map(
					(c) =>
						`| ${c.label} | ${c.harness} | ${c.human} | ${originalPrWording(c.notes[0] ?? "").replace(/\|/g, "/")} |`,
				),
				"",
				`**Judge's rationale:** ${originalPrWording(q.rationales[0] ?? "")}`,
				"",
			);
		}
	}

	lines.push(
		"Original PR time is the recorded coding + review time of the original PR for the same task at merge time; it is shown beside the agent, not as a counterfactual.",
		"",
	);
	return lines.join("\n");
}
