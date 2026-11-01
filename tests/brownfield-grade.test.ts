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
	isTestInfra,
	pytestSections,
	restorePytestSections,
	restoreTestInfra,
	scoreOutcomes,
} from "../src/brownfield/grade";

describe("resolution scoring (task 5.1)", () => {
	const f2p = ["t::fixed"];
	const p2p = ["t::kept"];
	test("resolved only when every scored test passes", () => {
		expect(
			scoreOutcomes(
				{ "t::fixed": "pass", "t::kept": "pass", "t::other": "fail" },
				f2p,
				p2p,
			).resolved,
		).toBe(true);
		expect(
			scoreOutcomes({ "t::fixed": "fail", "t::kept": "pass" }, f2p, p2p)
				.resolved,
		).toBe(false);
		expect(
			scoreOutcomes({ "t::fixed": "pass", "t::kept": "fail" }, f2p, p2p)
				.resolved,
		).toBe(false);
	});
	test("a missing scored test is not a pass", () => {
		const s = scoreOutcomes({ "t::fixed": "pass" }, f2p, p2p);
		expect(s.resolved).toBe(false);
		expect(s.passToPass["t::kept"]).toBe("missing");
	});
	test("a blocked-proxy or replay-only failure is a cassette-miss → unresolved", () => {
		const s = scoreOutcomes(
			{ "t::fixed": "fail-live", "t::kept": "pass" },
			f2p,
			p2p,
		);
		expect(s.cassetteMiss).toEqual(["t::fixed"]);
		expect(s.resolved).toBe(false);
	});
	test("crashed run or a task with no FAIL_TO_PASS never resolves", () => {
		expect(scoreOutcomes(null, f2p, p2p).resolved).toBe(false);
		expect(scoreOutcomes({ "t::kept": "pass" }, [], p2p).resolved).toBe(false);
	});
});

describe("test-infrastructure detection", () => {
	test("bundle test paths, conftest.py and pytest config files", () => {
		const tp = ["tests", "packages/core/tests"];
		expect(isTestInfra("tests/test_a.py", tp)).toBe(true);
		expect(isTestInfra("packages/core/tests/x.py", tp)).toBe(true);
		expect(isTestInfra("src/conftest.py", tp)).toBe(true);
		expect(isTestInfra("setup.cfg", tp)).toBe(true);
		expect(isTestInfra("src/pkg/core.py", tp)).toBe(false);
		expect(isTestInfra("testsuite/x.py", tp)).toBe(false);
	});
	test("pyproject: only [tool.pytest] sections are restored", () => {
		const base =
			'[project]\nname = "x"\n\n[tool.pytest.ini_options]\naddopts = "-q"\n';
		const cand =
			'[project]\nname = "x"\nversion = "2"\n\n[tool.pytest.ini_options]\naddopts = "-q -k not_slow"\n\n[tool.ruff]\nline-length = 99\n';
		const out = restorePytestSections(cand, base);
		expect(pytestSections(out)).toBe(pytestSections(base));
		expect(out).toContain('version = "2"');
		expect(out).toContain("line-length = 99");
	});
});

describe("restoreTestInfra on a real repo", () => {
	let repo: string;
	let base: string;
	beforeAll(async () => {
		repo = mkdtempSync(join(tmpdir(), "grade-"));
		await $`git init -q -b main ${repo}`.quiet();
		mkdirSync(join(repo, "tests"));
		mkdirSync(join(repo, "src"));
		writeFileSync(join(repo, "src", "lib.py"), "x = 1\n");
		writeFileSync(
			join(repo, "tests", "test_lib.py"),
			"def test_x(): assert True\n",
		);
		writeFileSync(join(repo, "conftest.py"), "# base\n");
		writeFileSync(
			join(repo, "pyproject.toml"),
			'[project]\nname = "x"\n\n[tool.pytest.ini_options]\naddopts = "-q"\n',
		);
		await $`git -C ${repo} add -A && git -C ${repo} -c user.name=t -c user.email=t@t commit -q -m base`.quiet();
		base = (await $`git -C ${repo} rev-parse HEAD`.text()).trim();
		// Candidate: a real fix, plus attempts to game the tests.
		writeFileSync(join(repo, "src", "lib.py"), "x = 2\n");
		writeFileSync(
			join(repo, "tests", "test_lib.py"),
			"import pytest\npytestmark = pytest.mark.skip\n",
		);
		writeFileSync(
			join(repo, "tests", "test_new.py"),
			"def test_mine(): pass\n",
		);
		writeFileSync(join(repo, "conftest.py"), "collect_ignore = ['tests']\n");
		writeFileSync(
			join(repo, "pyproject.toml"),
			'[project]\nname = "x"\n\n[tool.pytest.ini_options]\naddopts = "-q --deselect tests"\n',
		);
	});
	afterAll(() => rmSync(repo, { recursive: true, force: true }));

	test("restores test files, conftest and pytest config; keeps the source fix; flags each", async () => {
		const flagged = await restoreTestInfra(repo, base, ["tests"]);
		expect(flagged.sort()).toEqual([
			"conftest.py",
			"pyproject.toml [tool.pytest]",
			"tests/test_lib.py",
			"tests/test_new.py",
		]);
		expect(readFileSync(join(repo, "src", "lib.py"), "utf8")).toBe("x = 2\n");
		expect(readFileSync(join(repo, "tests", "test_lib.py"), "utf8")).toContain(
			"assert True",
		);
		expect(existsSync(join(repo, "tests", "test_new.py"))).toBe(false);
		expect(readFileSync(join(repo, "conftest.py"), "utf8")).toBe("# base\n");
		expect(readFileSync(join(repo, "pyproject.toml"), "utf8")).toContain(
			'addopts = "-q"\n',
		);
	});
});
