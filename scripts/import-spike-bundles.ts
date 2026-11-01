#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * Import the brownfield spike data as provisional task bundles
 * (add-brownfield-track task 2.5), so Studio review can start before the full
 * miner (tasks 1.2–1.4, 3.x) exists.
 *
 *   bun scripts/import-spike-bundles.ts [--force] [--only paper-qa,xarray,zarr-python]
 *
 * Reads brownfield/<spike>/{candidates.json, snapshots/, leaks/, validate/results.json}
 * and the repo's local clone (for base SHAs, patches, test paths). Imports every
 * snapshot that has leak labels. Writes brownfield/<owner>__<repo>/tasks/<id>/ with
 * `provisional: true`. Existing bundles are skipped unless --force; a bundle's
 * review/ directory is never touched.
 */
import { $ } from "bun";
import {
	BROWNFIELD_ROOT,
	ISSUE_VARIANTS,
	LeakLabels,
	type LeakLevel,
	MANIFEST_FILE,
	renderIssueVariant,
	repoDirName,
	Snapshot,
	taskId,
	writeManifest,
} from "../src/brownfield/bundle";

interface SpikeSource {
	spike: string;
	repo: string;
	clone: string;
}

const SOURCES: SpikeSource[] = [
	{ spike: "paper-qa", repo: "Future-House/paper-qa", clone: "paper-qa" },
	{ spike: "xarray", repo: "pydata/xarray", clone: "xarray" },
	{
		spike: "zarr-python",
		repo: "zarr-developers/zarr-python",
		clone: "zarr-python",
	},
];

const isTest = (p: string) =>
	/(^|\/)tests?\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p);
const DEPS_RE =
	/(^|\/)(uv|poetry|pdm|pixi)\.lock$|requirements[^/]*\.txt$|(^|\/)pyproject\.toml$|(^|\/)setup\.(py|cfg)$/;

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyIdx = args.indexOf("--only");
const only =
	onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? "").split(",")) : null;

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const iso = (s: string) => (s.length === 16 ? `${s}:00Z` : s);

let imported = 0;
let skipped = 0;
for (const src of SOURCES) {
	if (only && !only.has(src.spike)) continue;
	const sdir = join(BROWNFIELD_ROOT, src.spike);
	const clone = join(homedir(), "Documents", "code", src.clone);
	if (!existsSync(clone)) throw new Error(`clone missing: ${clone}`);
	const cands: { n: number; m: string; d: string }[] = readJson(
		join(sdir, "candidates.json"),
	);
	const results: Record<string, unknown>[] = existsSync(
		join(sdir, "validate", "results.json"),
	)
		? readJson(join(sdir, "validate", "results.json"))
		: [];
	const summary: {
		pr: number;
		issue: number;
		issueCreated: string;
		issueBeforeFix?: boolean;
	}[] = readJson(join(sdir, "snapshots", "summary.json"));

	for (const c of cands) {
		for (const s of summary.filter((x) => x.pr === c.n)) {
			const leaksPath = join(sdir, "leaks", `${s.pr}-${s.issue}.json`);
			const snapPath = join(
				sdir,
				"snapshots",
				`${s.pr}-${s.issue}.snapshot.json`,
			);
			if (!existsSync(leaksPath) || !existsSync(snapPath)) continue;

			const id = taskId(s.pr, s.issue);
			const dir = join(BROWNFIELD_ROOT, repoDirName(src.repo), "tasks", id);
			if (existsSync(join(dir, MANIFEST_FILE)) && !force) {
				skipped++;
				continue;
			}
			mkdirSync(join(dir, "issue"), { recursive: true });

			const leaks = LeakLabels.parse(readJson(leaksPath));
			const raw = readJson(snapPath);
			// Author roles come from the classifier's input; they are metadata, not labels.
			const roleOf = new Map(leaks.items.map((i) => [i.id, i.role]));
			const snap = Snapshot.parse({
				...raw,
				comments: raw.comments.map(
					(cm: Record<string, unknown>, i: number) => ({
						at: cm.at,
						author: cm.author,
						isBot: cm.isBot ?? false,
						assoc: cm.assoc,
						role: cm.isBot ? "bot" : roleOf.get(`c${i + 1}`),
						text: cm.text,
						source: cm.source,
					}),
				),
			});
			writeFileSync(
				join(dir, "snapshot.json"),
				`${JSON.stringify(snap, null, 2)}\n`,
			);
			for (const v of ISSUE_VARIANTS)
				writeFileSync(
					join(dir, "issue", `${v}.md`),
					renderIssueVariant(snap, v, { repo: src.repo, mergeSha: c.m }),
				);

			const files = (
				await $`git -C ${clone} diff --name-only ${c.m}^ ${c.m}`.text()
			)
				.trim()
				.split("\n")
				.filter(Boolean);
			const testFiles = files.filter(isTest);
			const srcFiles = files.filter((f) => !isTest(f));
			const diff = async (paths: string[]) =>
				paths.length
					? await $`git -C ${clone} diff --binary ${c.m}^ ${c.m} -- ${paths}`.text()
					: "";
			writeFileSync(join(dir, "reference.patch"), await diff(srcFiles));
			writeFileSync(join(dir, "tests.patch"), await diff(testFiles));

			const r = results.find((x) => x.pr === s.pr) as
				| {
						verdict: string;
						f2p?: string[];
						broken?: string[];
						flaky?: string[];
				  }
				| undefined;
			writeFileSync(
				join(dir, "validation.json"),
				`${JSON.stringify(r ?? { verdict: "unvalidated" }, null, 2)}\n`,
			);
			writeFileSync(
				join(dir, "leaks.json"),
				`${JSON.stringify(leaks, null, 2)}\n`,
			);

			const baseSha = (
				await $`git -C ${clone} rev-parse ${c.m}^`.text()
			).trim();
			const tree = (
				await $`git -C ${clone} ls-tree -r --name-only ${baseSha}`.text()
			).split("\n");
			const testPaths = [
				...new Set(
					tree
						.map((p) => p.match(/^(.*?(?:^|\/)tests?)\//)?.[1])
						.filter((p): p is string => Boolean(p)),
				),
			].sort();
			const level = (l: string | undefined) => (l ?? null) as LeakLevel | null;

			writeManifest(dir, {
				schemaVersion: 1,
				repo: src.repo,
				pr: s.pr,
				issues: [s.issue],
				baseSha,
				mergeSha: c.m,
				tStar: snap.tStar,
				issueCreatedAt: iso(s.issueCreated),
				prMergedAt: c.d,
				// The snapshotter's eligibility rule (D5) overrides the validator verdict.
				verdict:
					s.issueBeforeFix === false
						? "reject:issue-after-fix-start"
						: (r?.verdict ?? "unvalidated"),
				failToPass: r?.f2p ?? [],
				passToPass: [], // spike ran PR-touched tests only; full-suite P2P comes from task 3.4
				envBroken: r?.broken ?? [],
				flaky: r?.flaky ?? [],
				testPaths,
				depsTouched: srcFiles.some((f) => DEPS_RE.test(f)),
				appEgress: [],
				leak: {
					body: level(leaks.bodyLevel),
					comments: level(leaks.commentsLevel),
				},
				provisional: true,
			});
			imported++;
		}
	}
	console.log(`${src.spike}: done`);
}
console.log(`imported ${imported}, skipped ${skipped} existing`);
