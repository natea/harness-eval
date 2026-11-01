import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
import { buildSealedRepo, verifySealed } from "../src/brownfield/seal";
import {
	BrownfieldSeedError,
	captureCandidatePatch,
	ensureSealedRepo,
	projectName,
	seedWorkspace,
	TRIAL_BRANCH,
} from "../src/brownfield/seed";
import type { BrownfieldTrialTask } from "../src/orchestrator/scheduler";
import { WorktreeProvider } from "../src/providers/worktree";

const GIT_ID = ["-c", "user.email=t@example.com", "-c", "user.name=t"];

async function git(dir: string, args: string[]): Promise<string> {
	const r = await $`git -C ${dir} ${GIT_ID} ${args}`.quiet().nothrow();
	if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
	return r.stdout.toString().trim();
}

function sha(shas: string[], i: number): string {
	const s = shas[i];
	if (!s) throw new Error(`missing sha at index ${i}`);
	return s;
}

function write(dir: string, name: string, body: string): void {
	writeFileSync(join(dir, name), body);
}

/** A tiny upstream repo: three commits, so a base and a future commit exist. */
async function upstream(
	root: string,
): Promise<{ clone: string; shas: string[] }> {
	const clone = join(root, "upstream");
	mkdirSync(clone, { recursive: true });
	await git(clone, ["init", "-q", "-b", "main"]);
	write(clone, "README.md", "line one\n");
	write(
		clone,
		"pyproject.toml",
		'[build-system]\nrequires = []\n\n[project]\nname = "demo"\nversion = "0.1"\n',
	);
	await git(clone, ["add", "-A"]);
	await git(clone, ["commit", "-q", "-m", "one"]);
	const shas = [await git(clone, ["rev-parse", "HEAD"])];
	write(clone, "README.md", "line one\nline two\n");
	await git(clone, ["commit", "-q", "-am", "two"]);
	shas.push(await git(clone, ["rev-parse", "HEAD"]));
	write(clone, "fix.py", "print('fix')\n");
	await git(clone, ["add", "-A"]);
	await git(clone, ["commit", "-q", "-m", "three"]);
	shas.push(await git(clone, ["rev-parse", "HEAD"]));
	return { clone, shas };
}

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bf-seed-test-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

function task(baseSha: string, mergeSha: string): BrownfieldTrialTask {
	return {
		repoDir: "demo__demo",
		taskId: "pr1-issue1",
		variant: "body",
		bundleSha256: "0".repeat(64),
		baseSha,
		mergeSha,
		bundleDir: join(root, "bundle"),
		prompt: "prompt",
		issueFile: "ISSUE.md",
		issueContent: "# Something is broken\n\n_Opened by @someone_\n",
	};
}

describe("projectName", () => {
	test("reads the name inside [project]", () => {
		const dir = join(root, "p");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "pyproject.toml"),
			'[build-system]\nrequires = ["uv"]\n\n[project]\nversion = "1"\nname = "paper-qa"\nlicense = "MIT"\n',
		);
		expect(projectName(dir)).toBe("paper-qa");
	});

	test("ignores a name outside [project]", () => {
		const dir = join(root, "p");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "pyproject.toml"), '[tool.demo]\nname = "nope"\n');
		expect(projectName(dir)).toBeNull();
	});

	test("returns null without a pyproject", () => {
		const dir = join(root, "empty");
		mkdirSync(dir, { recursive: true });
		expect(projectName(dir)).toBeNull();
	});
});

describe("ensureSealedRepo", () => {
	test("builds, verifies and caches a sealed repo", async () => {
		const { clone, shas } = await upstream(root);
		const cacheRoot = join(root, "cache");
		const opts = {
			clone,
			baseSha: sha(shas, 0),
			futureShas: [sha(shas, 2)],
			cacheRoot,
			repoDir: "demo__demo",
		};
		const dir = await ensureSealedRepo(opts);
		expect(existsSync(dir)).toBe(true);
		expect(await verifySealed(dir, sha(shas, 0), [sha(shas, 2)])).toEqual([]);
		expect(readFileSync(join(dir, "README.md"), "utf8")).toBe("line one\n");

		// Second call reuses the cache (no rebuild, same path).
		expect(await ensureSealedRepo(opts)).toBe(dir);
	});

	test("rebuilds a cache entry that no longer verifies", async () => {
		const { clone, shas } = await upstream(root);
		const opts = {
			clone,
			baseSha: sha(shas, 0),
			futureShas: [sha(shas, 2)],
			cacheRoot: join(root, "cache"),
			repoDir: "demo__demo",
		};
		const dir = await ensureSealedRepo(opts);
		// Tamper: move the checkout onto the future commit.
		await git(dir, ["fetch", "-q", "--no-tags", clone, sha(shas, 2)]);
		await git(dir, ["checkout", "-q", "-B", "main", "FETCH_HEAD"]);
		expect(await verifySealed(dir, sha(shas, 0), [sha(shas, 2)])).not.toEqual(
			[],
		);

		const rebuilt = await ensureSealedRepo(opts);
		expect(rebuilt).toBe(dir);
		expect(await git(rebuilt, ["rev-parse", "HEAD"])).toBe(sha(shas, 0));
		expect(existsSync(join(rebuilt, "fix.py"))).toBe(false);
	});
});

describe("seedWorkspace and patch capture", () => {
	test("seeds the base on a trial branch and captures the candidate diff", async () => {
		const { clone, shas } = await upstream(root);
		const sealed = join(root, "sealed");
		await buildSealedRepo(clone, sha(shas, 0), sealed);

		const provider = new WorktreeProvider(join(root, "sandboxes"));
		const sandbox = await provider.provision("t1");
		try {
			await seedWorkspace(sandbox, task(sha(shas, 0), sha(shas, 2)), sealed);
			const issue = readFileSync(
				join(sandbox.workspacePath, "ISSUE.md"),
				"utf8",
			);
			expect(issue).toBe("# Something is broken\n\n_Opened by @someone_\n");
			expect(
				await git(sandbox.workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"]),
			).toBe(TRIAL_BRANCH);
			expect(await git(sandbox.workspacePath, ["rev-parse", "HEAD"])).toBe(
				sha(shas, 0),
			);
			// Environment artifacts are excluded locally, not in the tracked .gitignore.
			expect(
				readFileSync(join(sandbox.workspacePath, ".git/info/exclude"), "utf8"),
			).toContain(".venv/");

			// A candidate change plus an environment artifact and the issue file.
			writeFileSync(
				join(sandbox.workspacePath, "README.md"),
				"line one\nline two\n",
			);
			mkdirSync(join(sandbox.workspacePath, ".venv"), { recursive: true });
			writeFileSync(join(sandbox.workspacePath, ".venv", "marker"), "x");

			const capture = await captureCandidatePatch(
				sandbox,
				task(sha(shas, 0), sha(shas, 2)),
			);
			expect(capture.files).toEqual(["README.md"]);
			expect(capture.patch).toContain("+line two");
			expect(capture.patch).not.toContain("ISSUE.md");
			expect(capture.patch).not.toContain(".venv");
			expect(capture.status).toContain("?? ISSUE.md");
		} finally {
			await sandbox.destroy();
		}
	});

	test("capture is empty when the candidate changes nothing", async () => {
		const { clone, shas } = await upstream(root);
		const sealed = join(root, "sealed");
		await buildSealedRepo(clone, sha(shas, 0), sealed);
		const provider = new WorktreeProvider(join(root, "sandboxes"));
		const sandbox = await provider.provision("t2");
		try {
			await seedWorkspace(sandbox, task(sha(shas, 0), sha(shas, 2)), sealed);
			const capture = await captureCandidatePatch(
				sandbox,
				task(sha(shas, 0), sha(shas, 2)),
			);
			expect(capture.patch).toBe("");
			expect(capture.files).toEqual([]);
		} finally {
			await sandbox.destroy();
		}
	});

	test("refuses to seed a sandbox without copyIn", async () => {
		const { shas } = await upstream(root);
		const noCopy = {
			id: "fake:1",
			workspacePath: join(root, "ws"),
			exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
			copyOut: async () => {},
			writeFile: async () => {},
			destroy: async () => {},
		};
		await expect(
			seedWorkspace(
				noCopy as never,
				task(sha(shas, 0), sha(shas, 2)),
				join(root, "sealed"),
			),
		).rejects.toBeInstanceOf(BrownfieldSeedError);
	});
});
