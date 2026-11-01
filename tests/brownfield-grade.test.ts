import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	cpSync,
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
	gradeCandidate,
	isTestInfraPath,
	pytestConfig,
} from "../src/brownfield/grade";
import type { Outcome } from "../src/brownfield/testrun";

const GIT_ID = ["-c", "user.email=t@example.com", "-c", "user.name=t"];
const F2P = "tests.test_hidden::test_fix";
const P2P = "tests.test_base::test_ok";

async function git(dir: string, args: string[]): Promise<string> {
	const r = await $`git -C ${dir} ${GIT_ID} ${args}`.quiet().nothrow();
	if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
	return r.stdout.toString().trim();
}

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bf-grade-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

async function baseRepo(): Promise<string> {
	const dir = join(root, "base");
	mkdirSync(join(dir, "tests"), { recursive: true });
	writeFileSync(
		join(dir, "pyproject.toml"),
		'[project]\nname = "demo"\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
	);
	writeFileSync(join(dir, "src.py"), "def f():\n    return 1\n");
	writeFileSync(join(dir, "uv.lock"), "version = 1\nlock = 1\n");
	writeFileSync(
		join(dir, "tests/test_base.py"),
		"def test_ok():\n    assert True\n",
	);
	await git(dir, ["init", "-q", "-b", "main"]);
	await git(dir, ["add", "-A"]);
	await git(dir, ["commit", "-q", "-m", "base"]);
	return dir;
}

/** Patch produced by mutating a copy of the base repo. */
async function patchFor(
	dir: string,
	mutate: (copy: string) => void,
): Promise<string> {
	const copy = join(root, `copy-${Math.random().toString(36).slice(2)}`);
	cpSync(dir, copy, { recursive: true });
	mutate(copy);
	await git(copy, ["add", "-A", "-N"]);
	return (await $`git -C ${copy} diff --binary`.text()) + "\n";
}

const testsPatch = async (dir: string) =>
	patchFor(dir, (c) => {
		writeFileSync(
			join(c, "tests/test_hidden.py"),
			"def test_fix():\n    assert True\n",
		);
	});

const manifest = {
	failToPass: [F2P],
	passToPass: [P2P],
	testPaths: ["tests"],
	env: null,
};

function suite(outcomes: Record<string, Outcome | null>) {
	return async () => {
		const out: Record<string, Outcome> = {};
		for (const [id, o] of Object.entries(outcomes)) if (o) out[id] = o;
		return Object.keys(out).length ? out : null;
	};
}

describe("helpers", () => {
	test("test infra paths", () => {
		expect(isTestInfraPath("tests/test_x.py", ["tests"])).toBe(true);
		expect(isTestInfraPath("conftest.py", [])).toBe(true);
		expect(isTestInfraPath("src/conftest.py", ["src"])).toBe(true);
		expect(isTestInfraPath("src/app.py", ["tests"])).toBe(false);
	});
	test("pytest config section", () => {
		const toml =
			'[project]\nname="x"\n\n[tool.pytest.ini_options]\ntestpaths=["tests"]\n\n[tool.ruff]\n';
		expect(pytestConfig(toml)).toBe('testpaths=["tests"]');
		expect(pytestConfig("[project]\nname='x'\n")).toBe("");
	});
});

describe("gradeCandidate", () => {
	test("resolves when F2P and P2P pass", async () => {
		const base = await baseRepo();
		const candidate = await patchFor(base, (c) =>
			writeFileSync(join(c, "src.py"), "def f():\n    return 2\n"),
		);
		const grade = await gradeCandidate({
			sealedDir: base,
			candidatePatch: candidate,
			manifest,
			testsPatch: await testsPatch(base),
			workDir: join(root, "work"),
			deps: {
				buildEnv: async () => ({
					ok: true,
					method: "stub",
					log: "",
					digest: "d",
					seconds: 0,
				}),
				runSuite: suite({ [F2P]: "pass", [P2P]: "pass" }),
			},
		});
		expect(grade.verdict).toBe("resolved");
		expect(grade.reason).toBeNull();
		expect(grade.failToPass[F2P]).toBe("pass");
	});

	test("grades against the base lockfile, not the candidate's", async () => {
		const base = await baseRepo();
		const candidate = await patchFor(base, (c) => {
			writeFileSync(join(c, "src.py"), "def f():\n    return 2\n");
			writeFileSync(join(c, "uv.lock"), "version = 1\nlock = 2\n");
		});
		let seen = "";
		const grade = await gradeCandidate({
			sealedDir: base,
			candidatePatch: candidate,
			manifest,
			testsPatch: await testsPatch(base),
			workDir: join(root, "work"),
			deps: {
				buildEnv: async (dir) => {
					seen = readFileSync(join(dir, "uv.lock"), "utf8");
					return { ok: true, method: "stub", log: "", digest: "d", seconds: 0 };
				},
				runSuite: suite({ [F2P]: "pass", [P2P]: "pass" }),
			},
		});
		expect(seen).toBe("version = 1\nlock = 1\n");
		expect(grade.depsTouched).toBe(true);
		expect(grade.verdict).toBe("resolved");
	});

	test("unresolved when an F2P test fails or is missing", async () => {
		const base = await baseRepo();
		const candidate = await patchFor(base, (c) =>
			writeFileSync(join(c, "src.py"), "def f():\n    return 2\n"),
		);
		const grade = await gradeCandidate({
			sealedDir: base,
			candidatePatch: candidate,
			manifest,
			testsPatch: await testsPatch(base),
			workDir: join(root, "work"),
			deps: {
				buildEnv: async () => ({
					ok: true,
					method: "stub",
					log: "",
					digest: "d",
					seconds: 0,
				}),
				runSuite: suite({ [P2P]: "pass" }),
			},
		});
		expect(grade.verdict).toBe("unresolved");
		expect(grade.reason).toBe("fail-to-pass");
		expect(grade.failToPass[F2P]).toBe("missing");
	});

	test("restores test infrastructure the candidate touched", async () => {
		const base = await baseRepo();
		const candidate = await patchFor(base, (c) => {
			writeFileSync(join(c, "src.py"), "def f():\n    return 2\n");
			writeFileSync(
				join(c, "tests/test_base.py"),
				"def test_ok():\n    assert False\n",
			);
			writeFileSync(join(c, "conftest.py"), "raise SystemExit('hijacked')\n");
		});
		const grade = await gradeCandidate({
			sealedDir: base,
			candidatePatch: candidate,
			manifest,
			testsPatch: await testsPatch(base),
			workDir: join(root, "work"),
			deps: {
				buildEnv: async () => ({
					ok: true,
					method: "stub",
					log: "",
					digest: "d",
					seconds: 0,
				}),
				runSuite: async () => ({ [F2P]: "pass", [P2P]: "pass" }),
			},
		});
		expect(grade.testInfraModified.sort()).toEqual([
			"conftest.py",
			"tests/test_base.py",
		]);
		expect(
			readFileSync(join(root, "work/repo/tests/test_base.py"), "utf8"),
		).toBe("def test_ok():\n    assert True\n");
		expect(existsSync(join(root, "work/repo/conftest.py"))).toBe(false);
	});
});
