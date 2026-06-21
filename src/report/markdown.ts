import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DimensionStats, RunResults } from "../types";

function fmtMs(ms: number): string {
	return `${(ms / 60000).toFixed(1)}m`;
}
function fmtStats(
	s: DimensionStats,
	fmt: (n: number) => string = (n) => n.toFixed(1),
): string {
	return `${fmt(s.mean)} (±${fmt(s.stddev)}, ${fmt(s.min)}–${fmt(s.max)})`;
}

/** Markdown scorecard generator (task 7.2, eval-reporting spec). */
export function renderScorecard(r: RunResults): string {
	const lines: string[] = [];
	lines.push(`# Harness Eval Scorecard — run \`${r.runId}\``);
	lines.push("");
	const workerLabel = r.workerModel
		? `${r.workerModel.name} (${r.workerModel.provider})`
		: r.config.model;
	lines.push(
		`Harness **${r.config.harness}** · worker model **${workerLabel}** · provider **${r.config.provider}** · ${r.config.trialsPerCandidate} trial(s)/candidate`,
	);
	lines.push("");

	// Cross-model caveat badges (model-registry): judge bias and cost basis.
	const caveats: string[] = [];
	if (r.crossVendorJudge && r.judgeModel) {
		caveats.push(
			`> ⚠️ **Cross-vendor judge:** ${r.judgeModel.provider} judge (\`${r.judgeModel.name}\`) graded a ${r.workerModel?.provider ?? "different"}-vendor worker — quality scores may carry vendor bias.`,
		);
	}
	if (r.costSource && r.costSource !== "harness-reported") {
		caveats.push(
			r.costSource === "profile-priced"
				? "> ⚠️ **Cost basis:** token-spend dollars are estimated from profile pricing (the harness's `total_cost_usd` is Anthropic-priced and not valid off-vendor)."
				: "> ⚠️ **Cost basis:** tokens-only — no dollar figure (no pricing for this provider; the harness's `total_cost_usd` is Anthropic-priced and not valid off-vendor).",
		);
	}
	if (caveats.length) {
		lines.push(...caveats, "");
	}

	if (r.inconclusive && r.scores.length >= 2) {
		lines.push(
			`> ⚠️ **Inconclusive ordering:** the top two candidates' composite ranges overlap (${r.scores[0]?.candidate} ${r.scores[0]?.composite} ±${r.scores[0]?.compositeStats.stddev.toFixed(1)} vs ${r.scores[1]?.candidate} ${r.scores[1]?.composite} ±${r.scores[1]?.compositeStats.stddev.toFixed(1)}). More trials needed to separate them.`,
		);
		lines.push("");
	}

	lines.push("## Ranking");
	lines.push("");
	lines.push(
		"| # | Candidate | Composite | PRD adherence (40%) | Code quality (25%) | Speed (17.5%) | Token spend (17.5%) | Trials | Flags |",
	);
	lines.push(
		"|---|-----------|-----------|---------------------|--------------------|---------------|---------------------|--------|-------|",
	);
	const w = r.weights;
	const headerWeights = [
		w.prdAdherence,
		w.codeQuality,
		w.speed,
		w.tokenSpend,
	].map((x) => `${(x * 100).toFixed(1)}%`);
	// Replace default header weights if reconfigured
	if (headerWeights.join() !== "40.0%,25.0%,17.5%,17.5%") {
		lines[lines.length - 2] =
			`| # | Candidate | Composite | PRD adherence (${headerWeights[0]}) | Code quality (${headerWeights[1]}) | Speed (${headerWeights[2]}) | Token spend (${headerWeights[3]}) | Trials | Flags |`;
	}
	r.scores.forEach((s, i) => {
		lines.push(
			`| ${i + 1} | **${s.candidate}** | **${s.composite}** | ${s.dimensions.prdAdherence} | ${s.dimensions.codeQuality} | ${s.dimensions.speed} | ${s.dimensions.tokenSpend} | ${s.trialsCounted} | ${s.rightCensored ? "right-censored (capped trials)" : ""} |`,
		);
	});
	lines.push("");

	lines.push("## Dimension detail");
	lines.push("");
	for (const s of r.scores) {
		lines.push(`### ${s.candidate}`);
		lines.push("");
		lines.push(
			`- **PRD adherence** (Graded Score 0–100): ${fmtStats(s.stats.prdAdherence)}`,
		);
		lines.push(`- **Code quality** (0–100): ${fmtStats(s.stats.codeQuality)}`);
		lines.push(
			`- **Agent working time**: ${fmtStats(s.stats.speed, fmtMs)} → normalized ${s.dimensions.speed}`,
		);
		lines.push(
			`- **Cost (USD)**: ${fmtStats(s.stats.tokenSpend, (n) => `$${n.toFixed(2)}`)} → normalized ${s.dimensions.tokenSpend}`,
		);
		const trials = r.trials.filter(
			(t) => t.provenance.candidate === s.candidate,
		);
		for (const t of trials) {
			const a = t.grades?.adherence;
			const tel = t.telemetry;
			lines.push(
				`  - \`${t.provenance.trialId}\` [${t.provenance.status}${t.provenance.cappedBy ? `:${t.provenance.cappedBy}` : ""}] ` +
					(a
						? `graded ${a.gradedScore}, pass@1 ${a.passAt1 ? "yes" : "no"}${a.completeFailure ? ", COMPLETE FAILURE" : ""}`
						: "ungraded") +
					(tel
						? `; ${fmtMs(tel.agentDurationMs)} agent time, $${tel.totalCostUsd.toFixed(2)}, ${tel.totalTurns} turns, ${(tel.totalTokens.inputTokens + tel.totalTokens.outputTokens).toLocaleString()} tokens (+${tel.totalTokens.cacheReadTokens.toLocaleString()} cache-read)`
						: ""),
			);
			const da = t.grades?.designAdherence;
			if (da) {
				lines.push(
					`    - design adherence (\`${da.design}\`): **${da.score}** — color ${da.colorScore} (${da.colorsMatched}/${da.colorsTotal} tokens), type ${da.typographyScore} (${da.typographyMatched}/${da.typographyTotal})`,
				);
			}
			const integ = t.grades?.integration;
			if (integ?.ran) {
				const ok = integ.fixtures.filter(
					(f) => f.dispatched && f.handoffReached,
				).length;
				lines.push(
					`    - real-integration bonus: ${ok}/${integ.fixtures.length} fixtures fully handled`,
				);
			}
		}
		lines.push("");
	}

	if (r.exclusions.length > 0) {
		lines.push("## Excluded trials");
		lines.push("");
		for (const e of r.exclusions)
			lines.push(`- \`${e.trialId}\` — ${e.status}: ${e.reason}`);
		lines.push("");
	}

	lines.push("## Provenance");
	lines.push("");
	lines.push(`- PRD SHA-256: \`${r.prdSha256}\``);
	lines.push(`- Test plan SHA-256: \`${r.testPlanSha256 ?? "n/a"}\``);
	lines.push(
		`- Weights: adherence ${w.prdAdherence}, quality ${w.codeQuality}, speed ${w.speed}, spend ${w.tokenSpend}`,
	);
	if (r.workerModel) {
		lines.push(
			`- Worker model: \`${r.workerModel.name}\` (${r.workerModel.provider}, model \`${r.workerModel.modelId}\`${r.workerModel.endpointHost ? `, via ${r.workerModel.endpointHost}` : ""})`,
		);
	}
	const judgeRef = r.judgeModel;
	lines.push(
		judgeRef
			? `- Judge model: \`${judgeRef.name}\` (${judgeRef.provider})${r.crossVendorJudge ? " — cross-vendor" : ""}`
			: `- Judge model: \`${r.config.judgeModel}\``,
	);
	lines.push(`- Cost basis: ${r.costSource}`);
	lines.push(`- Started ${r.startedAt} · ended ${r.endedAt ?? "(incomplete)"}`);
	lines.push("");
	lines.push(
		"Per-trial candidate versions, harness versions, snapshot IDs, and session scripts: `trials/<trial-id>/provenance.json`.",
	);
	lines.push("");
	lines.push(
		"_Speed and token-spend scores are normalized within this run's candidate set; they are not comparable across runs. Results from different isolation providers are not directly comparable._",
	);
	return lines.join("\n");
}

export function writeScorecard(runDir: string, r: RunResults): string {
	const path = join(runDir, "scorecard.md");
	writeFileSync(path, renderScorecard(r));
	return path;
}
