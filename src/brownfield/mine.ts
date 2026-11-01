/**
 * The brownfield miner (tasks 1.2–1.6, 3.6): PR → screened candidates →
 * reconstructed issue at T* → sealed, validated, classified, frozen bundle.
 *
 * Every rejection is reported with a reason. Bundles are written under
 * brownfield/<owner>__<repo>/tasks/<id>/ with `provisional: false`; an existing
 * bundle's review/ directory is never touched.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { computeHumanBaseline } from "./baseline";
import {
	BROWNFIELD_ROOT,
	ISSUE_VARIANTS,
	MANIFEST_FILE,
	REVIEW_DIR,
	renderIssueVariant,
	repoDirName,
	type Snapshot,
	type TaskManifest,
	taskId,
	writeManifest,
} from "./bundle";
import {
	authorRole,
	type ClaudeRunner,
	classifyLeaks,
	claudeCliRunner,
	DEFAULT_LEAK_MODEL,
} from "./classify";
import type { EnvOptions } from "./env";
import {
	fetchTaskData,
	type GhRunner,
	ghCli,
	type MergedPr,
	type TaskData,
} from "./github";
import { testDirs } from "./paths";
import { screenPr } from "./screen";
import {
	collectImages,
	computeCutoff,
	type Fetcher,
	httpFetcher,
	issueOpenedAfterFixStart,
	reconstructIssue,
	rewriteImages,
} from "./snapshot";
import { validateTask } from "./validate";

export interface MineOptions {
	repo: string;
	/** Local clone of the repo, fetched recently enough to contain the merge commits. */
	clone: string;
	/** Scratch space for sealed repos and validation logs. */
	workRoot: string;
	env: Omit<EnvOptions, "excludeNewer">;
	selection: "touched" | "full";
	/** Classify leaks for VALID tasks (model spend, ≈$0.02/issue). */
	classify: boolean;
	model?: string;
	force?: boolean;
	root?: string;
	gh?: GhRunner;
	fetcher?: Fetcher;
	runner?: ClaudeRunner;
	log?: (msg: string) => void;
}

export interface MineReport {
	pr: number;
	issue?: number;
	verdict: string;
	bundle?: string;
	note?: string;
}

const run = async (args: string[], cwd: string) => {
	const r = await $`git ${args}`.cwd(cwd).quiet().nothrow();
	if (r.exitCode !== 0)
		throw new Error(
			`git ${args.join(" ")}: ${r.stderr.toString().slice(0, 200)}`,
		);
	return r.stdout.toString();
};

/** Remove a bundle's files except review/, so a re-mine leaves no stale files. */
function clearBundle(dir: string): void {
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir)) {
		if (name === REVIEW_DIR) continue;
		rmSync(join(dir, name), { recursive: true, force: true });
	}
}

export async function minePr(
	pr: MergedPr,
	opts: MineOptions,
): Promise<MineReport[]> {
	const gh = opts.gh ?? ghCli;
	const log = opts.log ?? (() => {});
	const root = opts.root ?? BROWNFIELD_ROOT;
	const firstIssue = pr.closingIssuesReferences[0]?.number;
	if (!firstIssue) return [{ pr: pr.number, verdict: "skip:no-closing-issue" }];

	const first = await fetchTaskData(opts.repo, pr.number, firstIssue, gh);
	const closing = first.pullRequest.closingIssuesReferences?.nodes ?? [];
	const screen = screenPr({
		repo: opts.repo,
		pr: pr.number,
		files: pr.files.map((f) => f.path),
		issues: closing.map((i) => ({
			number: i.number,
			repo: i.repository?.nameWithOwner ?? opts.repo,
		})),
	});
	const reports: MineReport[] = screen.rejected.map((r) => ({
		pr: pr.number,
		issue: r.issue,
		verdict: `skip:${r.reason}`,
	}));
	if (!screen.issues.length) return reports;

	const mergeSha = first.pullRequest.mergeCommit?.oid ?? pr.mergeCommit?.oid;
	if (!mergeSha)
		return [...reports, { pr: pr.number, verdict: "skip:no-merge-commit" }];
	if (
		(
			await $`git -C ${opts.clone} cat-file -e ${mergeSha}^{commit}`
				.quiet()
				.nothrow()
		).exitCode !== 0
	)
		throw new Error(
			`clone ${opts.clone} lacks merge commit ${mergeSha.slice(0, 12)} — git fetch it first`,
		);
	const baseSha = (
		await run(["rev-parse", `${mergeSha}^1`], opts.clone)
	).trim();
	const diff = async (paths: string[]) =>
		paths.length
			? await run(
					["diff", "--binary", `${mergeSha}^1`, mergeSha, "--", ...paths],
					opts.clone,
				)
			: "";
	const referencePatch = await diff(screen.srcFiles);
	const testsPatch = await diff(screen.testFiles);
	const testPaths = testDirs(
		(await run(["ls-tree", "-r", "--name-only", baseSha], opts.clone)).split(
			"\n",
		),
	);
	const futureShas = first.pullRequest.commits.nodes
		.map((n) => n.commit.oid)
		.filter((x): x is string => !!x);

	// Validation depends only on the PR, not the issue: run it once per PR.
	let validation: Awaited<ReturnType<typeof validateTask>> | null = null;

	for (const issueNo of screen.issues) {
		const data: TaskData =
			issueNo === firstIssue
				? first
				: await fetchTaskData(opts.repo, pr.number, issueNo, gh);
		const id = taskId(pr.number, issueNo);
		const dir = join(root, repoDirName(opts.repo), "tasks", id);
		if (existsSync(join(dir, MANIFEST_FILE)) && !opts.force) {
			reports.push({
				pr: pr.number,
				issue: issueNo,
				verdict: "skip:exists",
				bundle: dir,
			});
			continue;
		}
		const cutoff = computeCutoff(data.pullRequest, data.issue);
		if (issueOpenedAfterFixStart(data.issue, cutoff)) {
			reports.push({
				pr: pr.number,
				issue: issueNo,
				verdict: "reject:issue-after-fix-start",
			});
			continue;
		}
		const rec = reconstructIssue(data.issue, cutoff.cut);

		if (!validation) {
			log(`  #${pr.number}: validating (${opts.selection})…`);
			validation = await validateTask({
				clone: opts.clone,
				baseSha,
				mergeSha,
				futureShas,
				testsPatch,
				referencePatch,
				depsTouched: screen.depsTouched,
				workDir: join(opts.workRoot, repoDirName(opts.repo), `pr${pr.number}`),
				env: opts.env,
				selection: opts.selection,
				testPaths,
			});
		}

		const prAuthor = data.pullRequest.author?.login ?? "";
		const issueAuthor = data.issue.author?.login ?? "ghost";
		const { assets, failed } = await collectImages(
			[rec.body, ...rec.comments.map((c) => c.text)],
			opts.fetcher ?? httpFetcher,
		);
		const snapshot: Snapshot = {
			pr: pr.number,
			issue: issueNo,
			tStar: cutoff.tStar,
			title: rec.title,
			issueAuthor,
			body: rewriteImages(rec.body, assets),
			comments: rec.comments.map((c) => ({
				at: c.at,
				author: c.author,
				isBot: c.isBot,
				assoc: c.assoc,
				role: authorRole(c, issueAuthor, prAuthor),
				text: rewriteImages(c.text, assets),
				source: c.source,
			})),
			selfCheckFailures: rec.selfCheckFailures,
			imagesFailed: failed,
		};

		clearBundle(dir);
		mkdirSync(join(dir, "issue"), { recursive: true });
		for (const a of assets.values()) {
			mkdirSync(join(dir, "issue", "assets"), { recursive: true });
			writeFileSync(join(dir, a.path), a.bytes);
		}
		writeFileSync(
			join(dir, "snapshot.json"),
			`${JSON.stringify(snapshot, null, 2)}\n`,
		);
		for (const v of ISSUE_VARIANTS)
			writeFileSync(
				join(dir, "issue", `${v}.md`),
				renderIssueVariant(snapshot, v, { repo: opts.repo, mergeSha }),
			);
		writeFileSync(join(dir, "reference.patch"), referencePatch);
		writeFileSync(join(dir, "tests.patch"), testsPatch);
		writeFileSync(
			join(dir, "validation.json"),
			`${JSON.stringify(validation, null, 2)}\n`,
		);

		let leak: TaskManifest["leak"] = { body: null, comments: null };
		if (opts.classify && validation.verdict === "VALID") {
			const labels = await classifyLeaks(
				{
					snapshot,
					referencePatch,
					prAuthor,
					model: opts.model ?? DEFAULT_LEAK_MODEL,
				},
				opts.runner ?? claudeCliRunner,
			);
			writeFileSync(
				join(dir, "leaks.json"),
				`${JSON.stringify(labels, null, 2)}\n`,
			);
			leak = {
				body: labels.bodyLevel ?? null,
				comments: labels.commentsLevel ?? null,
			};
		}

		writeManifest(dir, {
			schemaVersion: 1,
			repo: opts.repo,
			pr: pr.number,
			issues: [issueNo],
			baseSha,
			mergeSha,
			tStar: cutoff.tStar,
			cutBy: cutoff.cutBy,
			issueCreatedAt: data.issue.createdAt,
			prMergedAt: data.pullRequest.mergedAt,
			verdict: validation.verdict,
			failToPass: validation.failToPass,
			passToPass: validation.passToPass,
			envBroken: validation.envBroken,
			flaky: validation.flaky,
			testPaths,
			depsTouched: screen.depsTouched,
			appEgress: [],
			leak,
			env: validation.env
				? {
						method: validation.env.method,
						digest: validation.env.digest,
						python: opts.env.python ?? "3.12",
						pkg: opts.env.pkg,
						extras: opts.env.extras,
					}
				: undefined,
			validationSelection: opts.selection,
			humanBaseline: computeHumanBaseline(
				data.pullRequest,
				cutoff.tStar,
				data.issue.createdAt,
			),
			provisional: false,
		});
		reports.push({
			pr: pr.number,
			issue: issueNo,
			verdict: validation.verdict,
			bundle: dir,
		});
	}
	return reports;
}
