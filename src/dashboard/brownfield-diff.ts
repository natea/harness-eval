/**
 * Split unified patches per file and line up the harness's files against the
 * original PR's, so the trial view can compare them one-to-one.
 */

export type FileStatus = "added" | "deleted" | "renamed" | "modified";

export type FileDiff = {
	path: string;
	oldPath: string;
	status: FileStatus;
	text: string;
};

export type DiffRow = {
	path: string;
	harness: FileDiff | null;
	original: FileDiff;
	/** The original side came from the tests hidden from the harness. */
	hiddenTest: boolean;
};

export type DiffAlignment = {
	/** Every file the original PR's fix changed, plus test files both sides changed. */
	rows: DiffRow[];
	/** Original test files the harness did not change. */
	otherOriginalTests: FileDiff[];
	/** Files the harness changed that the original PR did not. */
	harnessOnly: FileDiff[];
};

const unquote = (p: string) => p.replace(/^"|"$/g, "");

function parseFile(text: string): FileDiff {
	const lines = text.split("\n");
	const header = lines[0] ?? "";
	const m = header.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/);
	let oldPath = m?.[1] ?? "";
	let path = m?.[2] ?? "";
	let status: FileStatus = "modified";
	// Only the extended header precedes the first hunk; a hunk line can look
	// like a header line ("--- a/x" is a deleted "-- a/x").
	for (const line of lines.slice(1)) {
		if (line.startsWith("@@")) break;
		if (line.startsWith("new file mode")) status = "added";
		else if (line.startsWith("deleted file mode")) status = "deleted";
		else if (line.startsWith("rename from ")) {
			oldPath = unquote(line.slice(12));
			status = "renamed";
		} else if (line.startsWith("rename to ")) path = unquote(line.slice(10));
		else if (line.startsWith("--- a/")) oldPath = unquote(line.slice(6));
		else if (line.startsWith("+++ b/")) path = unquote(line.slice(6));
	}
	return { path: path || oldPath, oldPath: oldPath || path, status, text };
}

export function splitPatch(patch: string | null | undefined): FileDiff[] {
	if (!patch?.trim()) return [];
	return patch
		.split(/^(?=diff --git )/m)
		.filter((chunk) => chunk.startsWith("diff --git "))
		.map((chunk) => parseFile(chunk.trimEnd()));
}

export function alignPatches(
	candidate: string | null | undefined,
	reference: string | null | undefined,
	tests: string | null | undefined,
): DiffAlignment {
	const unclaimed = splitPatch(candidate);
	const claim = (o: FileDiff): FileDiff | null => {
		const i = unclaimed.findIndex(
			(h) =>
				h.path === o.path ||
				h.path === o.oldPath ||
				h.oldPath === o.path ||
				h.oldPath === o.oldPath,
		);
		return i < 0 ? null : (unclaimed.splice(i, 1)[0] ?? null);
	};

	const rows: DiffRow[] = splitPatch(reference).map((original) => ({
		path: original.path,
		harness: claim(original),
		original,
		hiddenTest: false,
	}));
	const otherOriginalTests: FileDiff[] = [];
	for (const original of splitPatch(tests)) {
		const harness = claim(original);
		if (harness)
			rows.push({ path: original.path, harness, original, hiddenTest: true });
		else otherOriginalTests.push(original);
	}
	return { rows, otherOriginalTests, harnessOnly: unclaimed };
}
