import type { SessionRecord, TokenUsage, TrialTelemetry } from "../types";

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
	};
}
