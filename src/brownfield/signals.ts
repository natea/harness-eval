/**
 * Secondary signals (task 5.2): localization precision/recall against the
 * reference patch and diff-size ratio. Judge-based quality scoring is separate
 * (judge ≠ worker) and is not part of these mechanical signals.
 */
export interface DiffStats {
	files: string[];
	additions: number;
	deletions: number;
}

/** Files and line counts touched by a unified diff. */
export function diffStats(patch: string): DiffStats {
	const files = new Set<string>();
	let additions = 0;
	let deletions = 0;
	for (const line of patch.split("\n")) {
		const file = /^diff --git a\/(\S+) b\//.exec(line);
		if (file?.[1]) {
			files.add(file[1]);
			continue;
		}
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("+")) additions++;
		else if (line.startsWith("-")) deletions++;
	}
	return { files: [...files].sort(), additions, deletions };
}

export interface Localization {
	/** Touched files that the reference also touches. */
	matched: string[];
	/** Reference files the candidate missed. */
	missed: string[];
	/** Candidate files the reference does not touch. */
	extra: string[];
	precision: number;
	recall: number;
	f1: number;
}

/** File-level localization of the candidate change against the reference change. */
export function localization(
	candidateFiles: string[],
	referenceFiles: string[],
): Localization {
	const cand = new Set(candidateFiles);
	const ref = new Set(referenceFiles);
	const matched = [...cand].filter((f) => ref.has(f)).sort();
	const missed = [...ref].filter((f) => !cand.has(f)).sort();
	const extra = [...cand].filter((f) => !ref.has(f)).sort();
	const precision = cand.size ? matched.length / cand.size : 0;
	const recall = ref.size ? matched.length / ref.size : 0;
	const f1 =
		precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
	return { matched, missed, extra, precision, recall, f1 };
}

/** Candidate diff size as a ratio of the original PR's change size. */
export function diffSizeRatio(
	candidate: DiffStats,
	reference: DiffStats,
): number | null {
	const refLines = reference.additions + reference.deletions;
	if (!refLines) return null;
	return (candidate.additions + candidate.deletions) / refLines;
}
