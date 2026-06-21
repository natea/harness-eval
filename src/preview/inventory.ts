/**
 * Read-only artifact audit for a completed trial (artifact-preview capability).
 *
 * Walks an archived trial directory WITHOUT mutating anything and returns an
 * inventory of what the candidate built: the workspace file tree (paths + sizes,
 * excluding vendored dirs), the target's cold-start contract, whether the
 * framework-marker-scrubbed blind copy is present, the recorded grades summary,
 * and any captured preview logs. The `runs/` tree is gitignored ground truth —
 * this reader only ever stats and reads it.
 */
import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
} from "node:fs";
import { join, relative } from "node:path";

/** Directories never worth listing in an audit (vendored / build output). */
const EXCLUDED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".cache",
	"coverage",
	"target",
	"vendor",
]);

/** Largest tree we will walk before truncating (audit stays snappy). */
const MAX_FILES = 2000;

export interface InventoryFile {
	/** Path relative to the workspace root. */
	path: string;
	bytes: number;
}

export interface GradesSummary {
	adherence: number | null;
	quality: number | null;
	passAt1: boolean | null;
	completeFailure: boolean | null;
}

export interface ArtifactInventory {
	trialId: string;
	/** Built workspace file tree (excluding vendored dirs), sorted by path. */
	files: InventoryFile[];
	totalBytes: number;
	/** True when the walk hit MAX_FILES and stopped early. */
	truncated: boolean;
	/** Vendored dirs present at the workspace root (e.g. node_modules) — noted,
	 *  not walked, so the reviewer knows deps were installed. */
	vendoredPresent: string[];
	/** The target's declared cold-start contract (human-readable lines). */
	coldStartContract: string[];
	/** Whether the agent actually wrote the scripts the contract references. */
	hasSetupScript: boolean;
	hasStartScript: boolean;
	/** The blind, framework-marker-scrubbed copy the judge graded exists. */
	blindCopyPresent: boolean;
	grades: GradesSummary | null;
	/** Captured preview cold-start logs (if a demo was ever run). */
	previewLogs: { setup?: string; start?: string } | null;
}

/** Recursively collect files under `dir`, excluding vendored dirs. Pure stat/read. */
function walk(
	root: string,
	dir: string,
	acc: InventoryFile[],
	state: { truncated: boolean },
): void {
	if (state.truncated) return;
	let entries: string[];
	try {
		entries = readdirSync(dir).sort();
	} catch {
		return;
	}
	for (const name of entries) {
		if (acc.length >= MAX_FILES) {
			state.truncated = true;
			return;
		}
		const full = join(dir, name);
		let st: ReturnType<typeof statSync>;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			if (EXCLUDED_DIRS.has(name)) continue;
			walk(root, full, acc, state);
		} else if (st.isFile()) {
			acc.push({ path: relative(root, full), bytes: st.size });
		}
	}
}

function readGrades(trialDir: string): GradesSummary | null {
	const p = join(trialDir, "grades.json");
	if (!existsSync(p)) return null;
	try {
		const g = JSON.parse(readFileSync(p, "utf8")) as {
			adherence?: { gradedScore?: number; passAt1?: boolean; completeFailure?: boolean };
			quality?: { score?: number };
		};
		return {
			adherence: g.adherence?.gradedScore ?? null,
			quality: g.quality?.score ?? null,
			passAt1: g.adherence?.passAt1 ?? null,
			completeFailure: g.adherence?.completeFailure ?? null,
		};
	} catch {
		return null;
	}
}

/**
 * Build the read-only inventory for a trial. `coldStartContract` is passed in
 * (resolved by the caller from the run's target) so this reader stays pure with
 * respect to target resolution and trivially testable.
 */
export function readInventory(
	trialId: string,
	trialDir: string,
	coldStartContract: string[] = [],
): ArtifactInventory {
	const workspace = join(trialDir, "workspace");
	const files: InventoryFile[] = [];
	const state = { truncated: false };
	const vendoredPresent: string[] = [];

	if (existsSync(workspace)) {
		for (const name of readdirSync(workspace)) {
			if (EXCLUDED_DIRS.has(name) && statSafe(join(workspace, name))) {
				vendoredPresent.push(name);
			}
		}
		walk(workspace, workspace, files, state);
	}

	const previewDir = join(trialDir, "preview-logs");
	const previewLogs = existsSync(previewDir)
		? {
				setup: readIfExists(join(previewDir, "setup.log")),
				start: readIfExists(join(previewDir, "start.log")),
			}
		: null;

	return {
		trialId,
		files,
		totalBytes: files.reduce((n, f) => n + f.bytes, 0),
		truncated: state.truncated,
		vendoredPresent,
		coldStartContract,
		hasSetupScript: existsSync(join(workspace, "setup.sh")),
		hasStartScript: existsSync(join(workspace, "start.sh")),
		blindCopyPresent: existsSync(join(trialDir, "workspace-blind")),
		grades: readGrades(trialDir),
		previewLogs,
	};
}

function statSafe(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function readIfExists(p: string): string | undefined {
	try {
		return existsSync(p) ? readFileSync(p, "utf8") : undefined;
	} catch {
		return undefined;
	}
}
