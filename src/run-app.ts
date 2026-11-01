/**
 * Which app a run evaluated (server side; add-app-filter-dropdown). A greenfield
 * run's app is the PRD target whose content hash it recorded; a brownfield run's
 * is the repository it replayed. Shared by Studio and the Dashboard so "app" means
 * the same thing in both.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadTarget } from "./targets";

export interface RunApp {
	/** Stable filter value: the target directory, or `owner/repo`. */
	name: string;
	/** Per-run description for tables. */
	title: string;
	/** The app's name across runs, for the dropdown. */
	appLabel: string;
}

/** PRD content hash → target, built once. */
let targetByShaCache: Map<string, { name: string; title: string }> | null =
	null;
export function targetBySha(): Map<string, { name: string; title: string }> {
	if (targetByShaCache) return targetByShaCache;
	const m = new Map<string, { name: string; title: string }>();
	for (const dir of readdirSync("targets")) {
		if (!existsSync(join("targets", dir, "target.yaml"))) continue;
		try {
			const t = loadTarget(dir);
			const title = t.prdContent.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? dir;
			m.set(t.prdSha256, { name: dir, title });
		} catch {
			// skip unloadable target
		}
	}
	targetByShaCache = m;
	return m;
}

interface TrialRef {
	provenance: { brownfield?: { repoDir: string; taskId: string } };
}

/** A brownfield run's app: the repo it replayed, described by its tasks. */
export function brownfieldApp(trials: TrialRef[]): RunApp | null {
	const refs = trials.flatMap((t) =>
		t.provenance.brownfield ? [t.provenance.brownfield] : [],
	);
	if (!refs.length) return null;
	const name = [...new Set(refs.map((r) => r.repoDir.replace("__", "/")))].join(
		", ",
	);
	const tasks = [...new Set(refs.map((r) => r.taskId))];
	return {
		name,
		title: `Brownfield: ${tasks.length > 2 ? `${tasks.length} tasks` : tasks.join(", ")}`,
		appLabel: `${name} (brownfield)`,
	};
}

/** The run's app, or null when it can't be identified (e.g. PRD re-frozen since). */
export function runApp(
	results: { prdSha256: string; trials: TrialRef[] },
	targets: Map<string, { name: string; title: string }> = targetBySha(),
): RunApp | null {
	const target = targets.get(results.prdSha256);
	if (target)
		return { ...target, appLabel: `${target.title} (${target.name})` };
	return brownfieldApp(results.trials);
}
