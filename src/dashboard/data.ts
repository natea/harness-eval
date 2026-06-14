import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RunResults, type TrialGrades } from "../types";

export interface RunIndexEntry {
	runId: string;
	dir: string;
	supported: boolean;
	/** Parsed results when supported; undefined otherwise. */
	results?: RunResults;
	schemaVersion?: number;
	error?: string;
}

const SUPPORTED_SCHEMA_VERSIONS = new Set([1]);

interface CacheSlot {
	mtimeMs: number;
	entry: RunIndexEntry;
}
const cache = new Map<string, CacheSlot>();

/**
 * Scan runs/ for results.json files, zod-validated, mtime-cached (dashboard
 * design D1). Unknown schemaVersions are listed as unsupported rather than
 * rendered incorrectly (results-dashboard spec).
 */
export function loadRunIndex(runsDir = "runs"): RunIndexEntry[] {
	if (!existsSync(runsDir)) return [];
	const entries: RunIndexEntry[] = [];
	for (const name of readdirSync(runsDir)) {
		const dir = join(runsDir, name);
		const resultsPath = join(dir, "results.json");
		if (!existsSync(resultsPath)) continue;
		const mtimeMs = statSync(resultsPath).mtimeMs;
		const cached = cache.get(resultsPath);
		if (cached && cached.mtimeMs === mtimeMs) {
			entries.push(cached.entry);
			continue;
		}
		let entry: RunIndexEntry;
		try {
			const raw = JSON.parse(readFileSync(resultsPath, "utf8"));
			if (!SUPPORTED_SCHEMA_VERSIONS.has(raw.schemaVersion)) {
				entry = {
					runId: raw.runId ?? name,
					dir,
					supported: false,
					schemaVersion: raw.schemaVersion,
					error: `unsupported schemaVersion ${raw.schemaVersion} — regenerate with \`bun run src/cli.ts report ${dir}\``,
				};
			} else {
				// Reattach grades persisted after results were written (same rule
				// as cmdReport) so the dashboard sees graded trials.
				for (const t of raw.trials ?? []) {
					const gradesPath = join(
						dir,
						"trials",
						t.provenance?.trialId ?? "",
						"grades.json",
					);
					if (t.grades === null && existsSync(gradesPath)) {
						t.grades = JSON.parse(
							readFileSync(gradesPath, "utf8"),
						) as TrialGrades;
					}
				}
				entry = {
					runId: raw.runId ?? name,
					dir,
					supported: true,
					schemaVersion: raw.schemaVersion,
					results: RunResults.parse(raw),
				};
			}
		} catch (err) {
			entry = {
				runId: name,
				dir,
				supported: false,
				error: `failed to load: ${String(err).slice(0, 200)}`,
			};
		}
		cache.set(resultsPath, { mtimeMs, entry });
		entries.push(entry);
	}
	return entries.sort((a, b) => b.runId.localeCompare(a.runId));
}

export function getRun(
	runId: string,
	runsDir = "runs",
): RunIndexEntry | undefined {
	return loadRunIndex(runsDir).find(
		(e) => e.runId === runId || e.dir.endsWith(runId),
	);
}
