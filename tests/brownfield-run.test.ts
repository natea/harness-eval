import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	renderIssueVariant,
	type Snapshot,
	type TaskManifest,
	writeManifest,
} from "../src/brownfield/bundle";
import { ClassifierIndependenceError } from "../src/brownfield/classify";
import {
	BrownfieldPromptError,
	ISSUE_FILE,
	issueVariantText,
	planTasks,
	renderBrownfieldPrompt,
} from "../src/brownfield/prompt";
import {
	assertTasksClassifierIndependent,
	BrownfieldRunError,
	buildBrownfieldMatrix,
	parseBrownfieldSpec,
	selectBrownfieldTasks,
	taskSetHash,
} from "../src/brownfield/run";
import type { CandidateEntry } from "../src/types";

const REPO = "acme/widgets";
const MERGE = "abcdef1234567890abcdef1234567890abcdef12";

const snapshot: Snapshot = {
	pr: 42,
	issue: 7,
	tStar: "2026-08-01T00:00:00Z",
	title: "Crash on empty input",
	issueAuthor: "reporter",
	body: "It crashes when input is empty.",
	comments: [
		{
			at: "2026-07-30T00:00:00Z",
			author: "helperbot",
			isBot: true,
			text: "Try #42.",
		},
	],
};

function manifest(
	over: Partial<TaskManifest> = {},
): Omit<TaskManifest, "files"> {
	return {
		schemaVersion: 1,
		repo: REPO,
		pr: 42,
		issues: [7],
		baseSha: "1111111aaaaaaa",
		mergeSha: MERGE,
		tStar: snapshot.tStar,
		issueCreatedAt: "2026-07-29T00:00:00Z",
		prMergedAt: "2026-08-02T00:00:00Z",
		verdict: "VALID",
		failToPass: ["tests/test_x.py::test_empty"],
		passToPass: [],
		envBroken: [],
		flaky: [],
		testPaths: ["tests"],
		depsTouched: false,
		appEgress: [],
		leak: { body: "symptom", comments: "diagnosis" },
		provisional: false,
		...over,
	};
}

const TEMPLATE =
	"Repo {{REPO}}. Read {{ISSUE_FILE}} and fix it. Do not consult upstream.";

let root: string;
let dir: string;

function makeBundle(opts: { id?: string; verdict?: string } = {}): string {
	const id = opts.id ?? "pr42-issue7";
	const d = join(root, "acme__widgets", "tasks", id);
	mkdirSync(join(d, "issue"), { recursive: true });
	writeFileSync(join(d, "snapshot.json"), JSON.stringify(snapshot));
	writeFileSync(join(d, "reference.patch"), "diff --git a/x b/x\n");
	writeFileSync(join(d, "tests.patch"), "diff --git a/t b/t\n");
	for (const v of ["body", "body+human", "body+all"] as const)
		writeFileSync(
			join(d, "issue", `${v}.md`),
			renderIssueVariant(snapshot, v, { repo: REPO, mergeSha: MERGE }),
		);
	writeManifest(d, manifest({ verdict: opts.verdict ?? "VALID" }));
	return d;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bf-run-"));
	dir = makeBundle();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("brownfield run config (task 4.1)", () => {
	test("parses the CLI surface and defaults the variant to body", () => {
		expect(parseBrownfieldSpec({ repo: REPO, tasks: "all" })).toEqual({
			repo: REPO,
			tasks: "all",
			variant: "body",
		});
		expect(
			parseBrownfieldSpec({
				repo: REPO,
				tasks: " pr42-issue7 , pr43-issue8 ",
				variant: "body+all",
			}).tasks,
		).toEqual(["pr42-issue7", "pr43-issue8"]);
	});

	test("rejects a bad repo, variant, missing tasks, or malformed task id", () => {
		expect(() => parseBrownfieldSpec({ repo: "nope", tasks: "all" })).toThrow(
			BrownfieldRunError,
		);
		expect(() =>
			parseBrownfieldSpec({ repo: REPO, tasks: "all", variant: "everything" }),
		).toThrow(/--variant/);
		expect(() => parseBrownfieldSpec({ repo: REPO })).toThrow(/--tasks/);
		expect(() => parseBrownfieldSpec({ repo: REPO, tasks: "pr42" })).toThrow(
			/invalid task id/,
		);
	});

	test("selects every accepted task for 'all', skipping rejected ones", () => {
		makeBundle({ id: "pr43-issue8", verdict: "fail:needs-live-api" });
		const tasks = selectBrownfieldTasks(
			{ repo: REPO, tasks: "all", variant: "body" },
			{ root },
		);
		expect(tasks.map((t) => t.id)).toEqual(["pr42-issue7"]);
	});

	test("an explicit id must exist and be accepted", () => {
		makeBundle({ id: "pr43-issue8", verdict: "fail:no-fail-to-pass" });
		expect(() =>
			selectBrownfieldTasks(
				{ repo: REPO, tasks: ["pr99-issue99"], variant: "body" },
				{ root },
			),
		).toThrow(/unknown task id/);
		expect(() =>
			selectBrownfieldTasks(
				{ repo: REPO, tasks: ["pr43-issue8"], variant: "body" },
				{ root },
			),
		).toThrow(/not eligible/);
	});

	test("a tampered bundle fails before dispatch, naming the file", () => {
		writeFileSync(join(dir, "reference.patch"), "tampered\n");
		expect(() =>
			selectBrownfieldTasks(
				{ repo: REPO, tasks: "all", variant: "body" },
				{ root },
			),
		).toThrow(/hash mismatch: reference\.patch/);
	});

	test("refuses tasks labelled by the run's worker model (D9)", () => {
		writeFileSync(
			join(dir, "leaks.json"),
			JSON.stringify({ model: "claude-opus-5-5", items: [] }),
		);
		writeManifest(dir, manifest());
		const tasks = selectBrownfieldTasks(
			{ repo: REPO, tasks: "all", variant: "body" },
			{ root },
		);
		expect(() =>
			assertTasksClassifierIndependent(tasks, "claude-opus-5-5"),
		).toThrow(ClassifierIndependenceError);
		expect(() =>
			assertTasksClassifierIndependent(tasks, "claude-haiku-5-5"),
		).not.toThrow();
	});

	test("task-set hash is stable and changes with the bundle", () => {
		const tasks = selectBrownfieldTasks(
			{ repo: REPO, tasks: "all", variant: "body" },
			{ root },
		);
		const before = taskSetHash(tasks);
		expect(before).toMatch(/^[0-9a-f]{64}$/);
		writeFileSync(join(dir, "issue", "body.md"), "changed\n");
		writeManifest(dir, manifest());
		expect(
			taskSetHash(
				selectBrownfieldTasks(
					{ repo: REPO, tasks: "all", variant: "body" },
					{ root },
				),
			),
		).not.toBe(before);
	});
});

describe("brownfield matrix (task 4.1)", () => {
	const candidate = (id: string) =>
		({
			id,
			name: id,
			repo: "https://example.test/x",
			pinnedVersion: "1.0.0",
			markerPaths: [],
			harnesses: {},
		}) as unknown as CandidateEntry;

	test("one trial per (candidate, task), with readable unique ids", () => {
		makeBundle({ id: "pr43-issue8" });
		const tasks = selectBrownfieldTasks(
			{ repo: REPO, tasks: "all", variant: "body" },
			{ root },
		);
		const planned = planTasks(tasks, "body", TEMPLATE);
		const plans = buildBrownfieldMatrix(
			[candidate("alpha"), candidate("beta")],
			planned,
		);
		expect(plans.map((p) => p.trialId)).toEqual([
			"alpha-pr42-issue7",
			"beta-pr42-issue7",
			"alpha-pr43-issue8",
			"beta-pr43-issue8",
		]);
		expect(new Set(plans.map((p) => p.trialId)).size).toBe(4);
	});

	test("prompts are byte-identical for every candidate running a task", () => {
		const tasks = selectBrownfieldTasks(
			{ repo: REPO, tasks: "all", variant: "body" },
			{ root },
		);
		const plans = buildBrownfieldMatrix(
			[candidate("alpha"), candidate("beta")],
			planTasks(tasks, "body", TEMPLATE),
		);
		const prompts = new Set(plans.map((p) => p.task?.prompt));
		expect(prompts.size).toBe(1);
		expect([...prompts][0]).toContain(`Read ${ISSUE_FILE}`);
	});
});

describe("brownfield prompt (task 4.2)", () => {
	test("renders the template slots exactly", () => {
		expect(
			renderBrownfieldPrompt(TEMPLATE, { repo: REPO, issueFile: ISSUE_FILE }),
		).toBe(
			`Repo ${REPO}. Read ${ISSUE_FILE} and fix it. Do not consult upstream.`,
		);
	});

	test("an unfilled slot fails instead of reaching a worker", () => {
		expect(() =>
			renderBrownfieldPrompt("Fix {{UNKNOWN_SLOT}}", {
				repo: REPO,
				issueFile: ISSUE_FILE,
			}),
		).toThrow(BrownfieldPromptError);
	});

	test("the shipped template carries the anti-cheat clause and no PR reference", () => {
		const template = readFileSync("config/brownfield-prompt.md", "utf8");
		expect(template).toMatch(/Do not consult upstream history, pull requests/);
		const rendered = renderBrownfieldPrompt(template, {
			repo: REPO,
			issueFile: ISSUE_FILE,
		});
		expect(rendered).not.toMatch(/#42|pull\/42|abcdef1/);
	});

	test("issue variants are read byte-exact from the frozen bundle", () => {
		const tasks = selectBrownfieldTasks(
			{ repo: REPO, tasks: "all", variant: "body+all" },
			{ root },
		);
		const [task] = planTasks(tasks, "body+all", TEMPLATE);
		expect(task?.issueContent).toBe(
			readFileSync(join(dir, "issue", "body+all.md"), "utf8"),
		);
		expect(task?.issueContent).toContain("**@helperbot** (bot)");
	});

	test("a drifted variant file is refused", () => {
		const tasks = selectBrownfieldTasks(
			{ repo: REPO, tasks: "all", variant: "body" },
			{ root },
		);
		writeFileSync(join(dir, "issue", "body.md"), "# different\n");
		writeManifest(dir, manifest());
		expect(() => issueVariantText(tasks[0] as never, "body")).toThrow(
			/drifted/,
		);
	});
});
