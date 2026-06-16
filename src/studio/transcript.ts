/**
 * Trial transcript endpoint helper (trial-transcript-audit). Resolves a trial's
 * archived transcripts and renders them to structured, role/direction-tagged
 * turns via the SAME parser that writes `conversation.md`, so the studio replay
 * and the on-disk Markdown cannot diverge. Resolves the trial directory
 * directly (no results.json required), so even a built-but-unfinalized run can
 * have its build conversation audited.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Turn, renderTrial } from "../report/transcript-render";

export interface TrialTranscript {
	trialId: string;
	sessions: { name: string; turns: Turn[] }[];
}

/** Rendered turns per session for a trial, or null if it has no transcripts. */
export function trialTranscript(
	runId: string,
	trialId: string,
	runsDir = "runs",
): TrialTranscript | null {
	const trialDir = join(runsDir, runId, "trials", trialId);
	if (!existsSync(join(trialDir, "transcripts"))) return null;
	const rendered = renderTrial(trialDir);
	return {
		trialId,
		sessions: rendered.sessions.map((s) => ({ name: s.name, turns: s.turns })),
	};
}
