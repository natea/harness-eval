import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import {
	type Bundle,
	loadBundle,
	writeManifest,
} from "../src/brownfield/bundle";
import {
	capturePatch,
	ISSUE_FILE,
	renderBrownfieldPrompt,
	seedWorkspace,
	TRIAL_BRANCH,
} from "../src/brownfield/workspace";
import { loadRegistry, renderSessionScript } from "../src/registry";

let root: string;
let clone: string;
let base: string;
let fix: string;
let bundle: Bundle;

const commit = async (file: string, body: string, msg: string) => {
	writeFileSync(join(clone, file), body);
	await $`git -C ${clone} add -A && git -C ${clone} -c user.name=t -c user.email=t@t commit -q -m ${msg}`.quiet();
	return (await $`git -C ${clone} rev-parse HEAD`.text()).trim();
};

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), "ws-"));
	clone = join(root, "clone");
	await $`git init -q -b main ${clone}`.quiet();
	base = await commit("lib.py", "x = 1\n", "base");
	fix = await commit("lib.py", "x = 2\n", "fix #42");

	const dir = join(root, "bf", "acme__w", "tasks", "pr42-issue7");
	mkdirSync(join(dir, "issue", "assets"), { recursive: true });
	writeFileSync(
		join(dir, "issue", "body.md"),
		"# Crash\n\n![shot](assets/abc.png)\n",
	);
	writeFileSync(
		join(dir, "issue", "body+all.md"),
		"# Crash\n\nwith comments\n",
	);
	writeFileSync(join(dir, "issue", "assets", "abc.png"), "PNG");
	writeFileSync(join(dir, "reference.patch"), "SECRET-REFERENCE");
	writeFileSync(join(dir, "tests.patch"), "SECRET-TESTS");
	writeFileSync(
		join(dir, "snapshot.json"),
		JSON.stringify({
			pr: 42,
			issue: 7,
			tStar: "2026-08-01T00:00:00Z",
			title: "Crash",
			issueAuthor: "r",
			body: "b",
			comments: [],
		}),
	);
	writeManifest(dir, {
		schemaVersion: 1,
		repo: "acme/w",
		pr: 42,
		issues: [7],
		baseSha: base,
		mergeSha: fix,
		tStar: "2026-08-01T00:00:00Z",
		issueCreatedAt: "2026-07-01T00:00:00Z",
		prMergedAt: "2026-08-02T00:00:00Z",
		verdict: "VALID",
		failToPass: [],
		passToPass: [],
		envBroken: [],
		flaky: [],
		testPaths: ["tests"],
		depsTouched: false,
		appEgress: [],
		leak: { body: null, comments: null },
		provisional: false,
	});
	bundle = loadBundle(dir);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("workspace seeding (task 4.2)", () => {
	test("sealed repo at base on a fresh branch, issue file present, no hidden material", async () => {
		const dest = join(root, "trial-a");
		await seedWorkspace(bundle, { clone, dest, variant: "body" });
		expect((await $`git -C ${dest} rev-parse HEAD`.text()).trim()).toBe(base);
		expect((await $`git -C ${dest} branch --show-current`.text()).trim()).toBe(
			TRIAL_BRANCH,
		);
		expect(
			(await $`git -C ${dest} cat-file -e ${fix}`.nothrow().quiet()).exitCode,
		).not.toBe(0);
		const issue = readFileSync(join(dest, ISSUE_FILE), "utf8");
		expect(issue).toContain("](ISSUE-assets/abc.png)");
		expect(existsSync(join(dest, "ISSUE-assets", "abc.png"))).toBe(true);
		const everything = (
			await $`grep -rl SECRET ${dest} --exclude-dir=.git`.nothrow().quiet()
		).stdout.toString();
		expect(everything).toBe("");
		expect((await $`git -C ${dest} status --porcelain`.text()).trim()).toBe(""); // issue file is excluded
	});

	test("the selected variant is what lands in the workspace", async () => {
		const dest = join(root, "trial-b");
		await seedWorkspace(bundle, { clone, dest, variant: "body+all" });
		expect(readFileSync(join(dest, ISSUE_FILE), "utf8")).toContain(
			"with comments",
		);
	});
});

describe("candidate patch capture (task 4.7)", () => {
	test("captures committed + uncommitted edits and new files, never the issue file", async () => {
		const dest = join(root, "trial-c");
		await seedWorkspace(bundle, { clone, dest, variant: "body" });
		writeFileSync(join(dest, "lib.py"), "x = 3\n");
		await $`git -C ${dest} -c user.name=a -c user.email=a@a commit -qam wip`.quiet();
		writeFileSync(join(dest, "new_module.py"), "y = 1\n");
		writeFileSync(join(dest, ISSUE_FILE), "agent scribbled here");
		const patch = await capturePatch(dest, base);
		expect(patch).toContain("+x = 3");
		expect(patch).toContain("new_module.py");
		expect(patch).not.toContain(ISSUE_FILE);
		expect(patch).not.toContain("ISSUE-assets");
		// Index left as found: new file still untracked.
		expect(await $`git -C ${dest} status --porcelain`.text()).toContain(
			"?? new_module.py",
		);
	});
});

describe("brownfield base prompt (task 4.2 fairness)", () => {
	const registry = loadRegistry("config/registry.yaml");
	const prompt = renderBrownfieldPrompt(registry.brownfieldBasePrompt ?? "");

	test("carries the generic anti-cheat clause and no task-specific content", () => {
		expect(prompt).toContain(ISSUE_FILE);
		expect(prompt).toMatch(
			/Do not consult the upstream project's pull requests/,
		);
		expect(prompt).not.toMatch(/\{\{|#\d|github\.com|pull\/\d/);
	});

	test("is byte-identical in every candidate's rendered session", () => {
		const withPrompt = { basePrompt: prompt };
		for (const c of registry.candidates) {
			for (const harness of Object.keys(c.harnesses)) {
				const steps = renderSessionScript(withPrompt, c, harness as never);
				const carrying = steps.filter((s) => s.prompt.includes(prompt));
				const raw =
					c.harnesses[harness as keyof typeof c.harnesses]?.session ?? [];
				const expected = raw.filter((s) =>
					s.prompt.includes("{{BASE_PROMPT}}"),
				).length;
				expect(carrying.length).toBe(expected);
			}
		}
	});

	test("an unknown placeholder is refused rather than sent to a worker", () => {
		expect(() =>
			renderBrownfieldPrompt("Fix {{ISSUE_FILE}} per {{PR_URL}}"),
		).toThrow(/PR_URL/);
	});
});
