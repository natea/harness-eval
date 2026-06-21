/**
 * Process-wide registry of in-progress trial sessions, so the studio's live
 * stream endpoint can find the file a building trial is currently writing
 * (live-build-stream). Populated best-effort by the driver while a session runs
 * and cleared when it ends; the SSE endpoint falls back to the archived
 * transcript when no live source is present (graceful degradation).
 */
import type { LineReader } from "./tap";

export interface LiveSource {
	reader: LineReader;
	/** The current session's output file (for diagnostics). */
	outFile: string;
}

const sources = new Map<string, LiveSource>();

/** Bare trial id from a sandbox id (e.g. `worktree:gsd-t1` → `gsd-t1`). */
export function trialIdFromSandbox(sandboxId: string): string {
	const i = sandboxId.indexOf(":");
	return i >= 0 ? sandboxId.slice(i + 1) : sandboxId;
}

export function registerLiveSource(trialId: string, source: LiveSource): void {
	sources.set(trialId, source);
}

/** Remove a source. If `source` is given, only removes it if still current
 *  (avoids a later step's source being clobbered by an earlier step's cleanup). */
export function unregisterLiveSource(trialId: string, source?: LiveSource): void {
	if (!source || sources.get(trialId) === source) sources.delete(trialId);
}

export function getLiveSource(trialId: string): LiveSource | undefined {
	return sources.get(trialId);
}
