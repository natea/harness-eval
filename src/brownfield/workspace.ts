/**
 * Brownfield trial workspaces (eval-orchestration; tasks 4.2, 4.7).
 *
 * A trial workspace is the task's sealed repo at the base commit on a fresh
 * branch, with the selected issue variant written to ISSUE.md. The issue file
 * and its images are excluded via .git/info/exclude, so they never appear in the
 * captured candidate patch. Neither the reference patch nor the hidden tests are
 * ever written here.
 */

import {
	appendFileSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { type Bundle, type IssueVariant, readText } from "./bundle";
import { buildSealedRepo, verifySealed } from "./seal";

export const ISSUE_FILE = "ISSUE.md";
export const ISSUE_ASSETS_DIR = "ISSUE-assets";
export const TRIAL_BRANCH = "work";

/** Render the brownfield base prompt; identical for every task and candidate. */
export function renderBrownfieldPrompt(template: string): string {
	const out = template.replaceAll("{{ISSUE_FILE}}", ISSUE_FILE);
	const leftover = out.match(/\{\{[A-Z_]+\}\}/);
	if (leftover)
		throw new Error(
			`brownfield prompt has an unknown placeholder: ${leftover[0]}`,
		);
	return out;
}

export interface SeedOptions {
	clone: string;
	dest: string;
	variant: IssueVariant;
	/** Commits that must be absent (merge commit; PR commits if known). */
	futureShas?: string[];
}

export async function seedWorkspace(
	bundle: Bundle,
	opts: SeedOptions,
): Promise<void> {
	const m = bundle.manifest;
	await buildSealedRepo(opts.clone, m.baseSha, opts.dest, {
		branch: TRIAL_BRANCH,
	});
	const problems = await verifySealed(opts.dest, m.baseSha, [
		m.mergeSha,
		...(opts.futureShas ?? []),
	]);
	if (problems.length)
		throw new Error(
			`workspace for ${bundle.id} is not sealed: ${problems.join("; ")}`,
		);

	const issue = readText(bundle.dir, `issue/${opts.variant}.md`);
	if (issue == null)
		throw new Error(`${bundle.id}: missing issue variant ${opts.variant}`);
	// Bundled images live under issue/assets/; in the workspace they sit beside ISSUE.md.
	writeFileSync(
		join(opts.dest, ISSUE_FILE),
		issue.replaceAll("](assets/", `](${ISSUE_ASSETS_DIR}/`),
	);
	const assets = join(bundle.dir, "issue", "assets");
	if (existsSync(assets)) {
		mkdirSync(join(opts.dest, ISSUE_ASSETS_DIR), { recursive: true });
		for (const f of readdirSync(assets))
			copyFileSync(join(assets, f), join(opts.dest, ISSUE_ASSETS_DIR, f));
	}
	appendFileSync(
		join(opts.dest, ".git", "info", "exclude"),
		`\n/${ISSUE_FILE}\n/${ISSUE_ASSETS_DIR}/\n`,
	);
}

/**
 * The candidate's change relative to the base commit: committed and uncommitted
 * edits plus new files, binary-safe, excluding the issue file. Leaves the index
 * as it found it.
 */
export async function capturePatch(
	dest: string,
	baseSha: string,
): Promise<string> {
	await $`git -C ${dest} add -A`.quiet();
	const diff =
		await $`git -C ${dest} diff --cached --binary ${baseSha}`.quiet();
	await $`git -C ${dest} reset -q`.quiet().nothrow();
	return diff.stdout.toString();
}
