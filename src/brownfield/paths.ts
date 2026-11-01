/** Path classification shared by the miner, validator, and importer (design D5). */

/** A test file: anything under a `test/` or `tests/` directory, or a `test_*.py` module. */
export function isTestPath(p: string): boolean {
	return /(^|\/)tests?\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p);
}

/** A file declaring or locking dependencies; touching one sets `deps-touched` (D5). */
export function isDependencyPath(p: string): boolean {
	return /(^|\/)(uv|poetry|pdm|pixi)\.lock$|(^|\/)requirements[^/]*\.txt$|(^|\/)pyproject\.toml$|(^|\/)setup\.(py|cfg)$/.test(
		p,
	);
}

/** Non-test source code (the part of a PR that becomes reference.patch). */
export function isSourceCodePath(p: string): boolean {
	return !isTestPath(p) && /\.py$/.test(p);
}

/** Test directories at a commit, from `git ls-tree -r --name-only` output. */
export function testDirs(treePaths: string[]): string[] {
	const dirs = new Set<string>();
	for (const p of treePaths) {
		const m = p.match(/^(.*?(?:^|\/)tests?)\//);
		if (m?.[1]) dirs.add(m[1]);
	}
	return [...dirs].sort();
}
