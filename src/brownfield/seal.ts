/**
 * Sealed base repository (design D6, task 3.1).
 *
 * A fresh repo containing only history reachable from the base commit, plus past
 * tags (tags pointing at ancestors). No remotes, no reflog, no future tags, and
 * after gc no dangling objects. SWE-bench issue #465 is the motivating failure:
 * agents ran `git log --all` and found the fix. Deleting refs isn't enough;
 * the object store itself must not contain the fix.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { $ } from "bun";

async function git(
	dir: string,
	args: string[],
): Promise<{ code: number; out: string; err: string }> {
	const r = await $`git -C ${dir} ${args}`.quiet().nothrow();
	return {
		code: r.exitCode,
		out: r.stdout.toString(),
		err: r.stderr.toString(),
	};
}

async function must(dir: string, args: string[]): Promise<string> {
	const r = await git(dir, args);
	if (r.code !== 0)
		throw new Error(
			`git ${args.join(" ")} failed in ${dir}: ${r.err.slice(0, 300)}`,
		);
	return r.out;
}

export interface SealOptions {
	/** Branch name for the sealed checkout (default `main`). */
	branch?: string;
	/** Keep tags that point at ancestors of the base commit (default true). */
	pastTags?: boolean;
}

/** Build a sealed repo at `dest` from a local clone. `dest` must not exist or be empty. */
export async function buildSealedRepo(
	clone: string,
	baseSha: string,
	dest: string,
	opts: SealOptions = {},
): Promise<void> {
	if (existsSync(dest) && readdirSync(dest).length)
		throw new Error(`seal destination not empty: ${dest}`);
	mkdirSync(dest, { recursive: true });
	const branch = opts.branch ?? "main";
	await must(dest, ["init", "-q", "-b", branch]);
	// Fetch by path: no remote is configured, and only base's history comes across.
	await must(dest, ["fetch", "-q", "--no-tags", clone, baseSha]);
	await must(dest, ["checkout", "-q", "-B", branch, "FETCH_HEAD"]);

	if (opts.pastTags !== false) {
		const tags = (await must(clone, ["tag", "--merged", baseSha]))
			.split("\n")
			.filter(Boolean);
		for (let i = 0; i < tags.length; i += 200) {
			const refspecs = tags
				.slice(i, i + 200)
				.map((t) => `refs/tags/${t}:refs/tags/${t}`);
			await must(dest, ["fetch", "-q", "--no-tags", clone, ...refspecs]);
		}
	}

	await $`rm -f ${dest}/.git/FETCH_HEAD ${dest}/.git/ORIG_HEAD`
		.quiet()
		.nothrow();
	await must(dest, ["reflog", "expire", "--expire=now", "--all"]);
	await must(dest, ["gc", "-q", "--prune=now"]);
}

/**
 * Problems that would let a worker reach the future. Empty = sealed.
 * `futureShas` should include the merge commit and the PR's own commits.
 */
export async function verifySealed(
	dest: string,
	baseSha: string,
	futureShas: string[],
): Promise<string[]> {
	const problems: string[] = [];
	for (const sha of futureShas)
		if ((await git(dest, ["cat-file", "-e", `${sha}^{commit}`])).code === 0)
			problems.push(`future commit present: ${sha.slice(0, 12)}`);
	const head = (await must(dest, ["rev-parse", "HEAD"])).trim();
	if (
		!head.startsWith(baseSha.slice(0, 7)) &&
		!baseSha.startsWith(head.slice(0, baseSha.length))
	)
		problems.push(`HEAD ${head.slice(0, 12)} is not the base commit`);
	const beyond = (
		await must(dest, ["rev-list", "--all", "--not", baseSha])
	).trim();
	if (beyond)
		problems.push(
			`refs reach commits not in base's history: ${beyond.split("\n").length}`,
		);
	const remotes = (await must(dest, ["remote"])).trim();
	if (remotes) problems.push(`remotes configured: ${remotes}`);
	const fsck = await git(dest, ["fsck", "--lost-found", "--no-reflogs"]);
	const dangling = (fsck.out + fsck.err)
		.split("\n")
		.filter((l) => /dangling commit/.test(l));
	if (dangling.length)
		problems.push(`dangling commits recoverable: ${dangling.length}`);
	return problems;
}
