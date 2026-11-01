import type { SessionRecord, TokenUsage, TrialTelemetry } from "../types";

/**
 * First Claude Code version seen reporting cumulative cost on resume. Measured
 * from archived runs: on 2.1.316 every step's increase matches that step's own
 * token cost, while 2.1.170 costs often fall between steps, so they are per-step.
 * Versions between those two are unobserved and treated as per-step.
 */
const CUMULATIVE_COST_SINCE = [2, 1, 316];

export function reportsCumulativeResumeCost(version?: string | null): boolean {
	const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
	if (!m) return false;
	const v = [Number(m[1]), Number(m[2]), Number(m[3])];
	for (const [i, floor] of CUMULATIVE_COST_SINCE.entries()) {
		if ((v[i] as number) !== floor) return (v[i] as number) > floor;
	}
	return true;
}

/**
 * Display-time cost for a trial archived before per-step costs were recorded.
 * Returns a corrected copy and never writes, so archived results stay as recorded.
 * A session whose reported cost ever falls is left alone: it isn't a running total.
 */
export function withCorrectedCosts<
	T extends {
		provenance: { harness?: string; harnessVersion?: string | null };
		telemetry?: TrialTelemetry | null;
	},
>(trial: T): T {
	const tel = trial.telemetry;
	if (
		!tel ||
		tel.costBasis ||
		trial.provenance.harness !== "claude-code" ||
		!reportsCumulativeResumeCost(trial.provenance.harnessVersion)
	)
		return trial;
	const last = new Map<string, number>();
	const falls = new Set<string>();
	for (const s of tel.sessions) {
		if ((last.get(s.sessionId) ?? 0) > s.costUsd) falls.add(s.sessionId);
		last.set(s.sessionId, s.costUsd);
	}
	last.clear();
	const sessions = tel.sessions.map((s) => {
		const prior = last.get(s.sessionId) ?? 0;
		last.set(s.sessionId, s.costUsd);
		return falls.has(s.sessionId) || s.partial
			? s
			: { ...s, costUsd: s.costUsd - prior };
	});
	return {
		...trial,
		telemetry: {
			...tel,
			sessions,
			totalCostUsd: sessions.reduce((n, s) => n + s.costUsd, 0),
			costBasis: "corrected-from-cumulative",
		},
	};
}

/**
 * Aggregate per-session records into trial telemetry. Speed dimension uses
 * agent working time only — sandbox setup/install time is recorded
 * separately and never counts toward speed (run-telemetry spec).
 */
export function aggregateTelemetry(
	sessions: SessionRecord[],
	setupDurationMs: number,
): TrialTelemetry {
	const totalTokens: TokenUsage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
	};
	let agentDurationMs = 0;
	let totalCostUsd = 0;
	let totalTurns = 0;
	for (const s of sessions) {
		agentDurationMs += s.durationMs;
		totalCostUsd += s.costUsd;
		totalTurns += s.numTurns;
		totalTokens.inputTokens += s.usage.inputTokens;
		totalTokens.outputTokens += s.usage.outputTokens;
		totalTokens.cacheReadTokens += s.usage.cacheReadTokens;
		totalTokens.cacheCreationTokens += s.usage.cacheCreationTokens;
	}
	return {
		sessions,
		agentDurationMs,
		setupDurationMs,
		totalCostUsd,
		totalTokens,
		totalTurns,
		costBasis: "per-step",
	};
}
