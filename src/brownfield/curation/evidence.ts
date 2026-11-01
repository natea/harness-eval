/**
 * Per-role evidence (add-task-curation-collective 1.3, D3). Each builder returns
 * the prompt text plus an input manifest naming exactly what the role received.
 */
import { join } from "node:path";
import { $ } from "bun";
import { loadBundle, readSnapshot, readText, type Snapshot } from "../bundle";
import { authorRole } from "../classify";
import { isSourceCodePath } from "../paths";

export interface TaskCtx {
	task: string;
	dir: string;
	repo: string;
	baseSha: string;
	snapshot: Snapshot;
	prAuthor: string;
	reference: string;
	testsPatch: string;
	failToPass: string[];
	passToPass: string[];
	flaky: string[];
	envBroken: string[];
	refFiles: string[];
	refLines: number;
	/** Non-test source files at the base commit. */
	fileList: string[];
	/** `git log` of each reference file, base-reachable only. */
	history: string;
}

const clip = (s: string, n: number) =>
	s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s;

export function patchFiles(patch: string): string[] {
	return [...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1] as string);
}

export function patchLines(patch: string): number {
	return patch
		.split("\n")
		.filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l)).length;
}

export async function loadTaskCtx(dir: string, clone: string): Promise<TaskCtx> {
	const b = loadBundle(dir);
	const m = b.manifest;
	const snapshot = readSnapshot(dir);
	const reference = readText(dir, "reference.patch") ?? "";
	const refFiles = patchFiles(reference).filter(isSourceCodePath);
	const fileList = (await $`git -C ${clone} ls-tree -r --name-only ${m.baseSha}`.text())
		.split("\n")
		.filter((p) => p && isSourceCodePath(p));
	const logs: string[] = [];
	for (const f of refFiles) {
		// `git log <base>` walks only ancestors of the base commit (no future commits).
		const log = await $`git -C ${clone} log --format=%h%x20%ad%x20%an%x20%s --date=short -n 25 ${m.baseSha} -- ${f}`
			.nothrow()
			.text();
		logs.push(`### ${f}\n${log.trim() || "(no earlier commits)"}`);
	}
	const fixer = snapshot.comments.find((c) => c.role?.startsWith("future fixer"));
	return {
		task: b.id,
		dir,
		repo: m.repo,
		baseSha: m.baseSha,
		snapshot,
		prAuthor: fixer?.author ?? "",
		reference,
		testsPatch: readText(dir, "tests.patch") ?? "",
		failToPass: m.failToPass,
		passToPass: m.passToPass,
		flaky: m.flaky,
		envBroken: m.envBroken,
		refFiles,
		refLines: patchLines(reference),
		fileList,
		history: logs.join("\n\n"),
	};
}

export interface ThreadItem {
	id: string;
	author: string;
	role: string;
	isBot: boolean;
	text: string;
}

export function threadItems(ctx: TaskCtx): ThreadItem[] {
	const s = ctx.snapshot;
	return [
		{ id: "body", author: s.issueAuthor, role: "issue author", isBot: false, text: s.body },
		...s.comments.map((c, i) => ({
			id: `c${i + 1}`,
			author: c.author,
			role: c.role ?? authorRole(c, s.issueAuthor, ctx.prAuthor),
			isBot: c.isBot,
			text: c.text,
		})),
	];
}

/** The issue at T*: title plus the given items, bots tagged, ids shown. */
/**
 * `showRole: false` hides task-relative roles such as "future fixer", which only
 * the gold comparer (the D9 prompt) is given; bot tags are always shown, as on GitHub.
 */
export function renderThread(ctx: TaskCtx, items: ThreadItem[], showRole = true): string {
	return (
		`## Issue title\n\n${ctx.snapshot.title}\n\n` +
		items
			.map(
				(it) =>
					`### id=${it.id} — @${it.author}${it.isBot ? " [bot]" : ""}${showRole ? ` (${it.role})` : ""}\n\n${clip(it.text, 6000)}\n`,
			)
			.join("\n")
	);
}

export function renderTests(ctx: TaskCtx): string {
	const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "(none)");
	return (
		`## Hidden test patch\n\n\`\`\`diff\n${clip(ctx.testsPatch, 20000)}\n\`\`\`\n\n` +
		`## Validation\n\nFAIL_TO_PASS (scored):\n${list(ctx.failToPass)}\n\nPASS_TO_PASS (scored):\n${list(ctx.passToPass)}\n\nflaky (not scored):\n${list(ctx.flaky)}\n\nenv-broken (not scored):\n${list(ctx.envBroken)}\n`
	);
}

export function renderReference(ctx: TaskCtx): string {
	return `## Reference fix (merged PR, non-test files only)\n\n\`\`\`diff\n${clip(ctx.reference || "(no non-test changes)", 20000)}\n\`\`\`\n`;
}

export function renderHistory(ctx: TaskCtx): string {
	return `## Pre-fix history of the touched files (up to the base commit)\n\n${ctx.history}\n`;
}

export function renderFileList(ctx: TaskCtx): string {
	return `## Repository source files (non-test) at the base commit\n\n${ctx.fileList.join("\n")}\n`;
}

export const cloneFor = (repo: string) =>
	join(process.env.HOME ?? "", ".cache/harness-eval/clones", `${repo.replace("/", "__")}.git`);
