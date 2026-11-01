import { describe, expect, test } from "bun:test";
import { parseJunit } from "../src/brownfield/testrun";
import { classifyRuns } from "../src/brownfield/validate";

const deps = { depsTouched: false };

describe("validation verdicts (tasks 3.4, 3.8)", () => {
	test("fail→pass in both gold runs is FAIL_TO_PASS → VALID", () => {
		const c = classifyRuns(
			{ a: "fail", b: "pass" },
			{ a: "pass", b: "pass" },
			{ a: "pass", b: "pass" },
			deps,
		);
		expect(c.verdict).toBe("VALID");
		expect(c.failToPass).toEqual(["a"]);
		expect(c.passToPass).toEqual(["b"]);
	});

	test("a test missing before (new module) counts as failing before", () => {
		const c = classifyRuns({}, { new: "pass" }, { new: "pass" }, deps);
		expect(c.failToPass).toEqual(["new"]);
	});

	test("differing gold outcomes are flaky and excluded", () => {
		const c = classifyRuns({ a: "fail" }, { a: "pass" }, { a: "fail" }, deps);
		expect(c.flaky).toEqual(["a"]);
		expect(c.verdict).toBe("fail:no-fail-to-pass");
	});

	test("a test the reference regresses rejects the task", () => {
		const c = classifyRuns(
			{ a: "fail", b: "pass" },
			{ a: "pass", b: "fail" },
			{ a: "pass", b: "fail" },
			deps,
		);
		expect(c.verdict).toBe("fail:gold-regression");
		expect(c.goldRegress).toEqual(["b"]);
	});

	test("live-API failures with no FAIL_TO_PASS → needs-live-api (D17)", () => {
		const c = classifyRuns(
			{ a: "fail-live" },
			{ a: "fail-live" },
			{ a: "fail-live" },
			deps,
		);
		expect(c.verdict).toBe("fail:needs-live-api");
		expect(c.envBroken).toEqual(["a"]);
		expect(c.liveApi).toEqual(["a"]);
	});

	test("live-API env-broken tests don't block a task that has FAIL_TO_PASS", () => {
		const c = classifyRuns(
			{ a: "fail", l: "fail-live" },
			{ a: "pass", l: "fail-live" },
			{ a: "pass", l: "fail-live" },
			deps,
		);
		expect(c.verdict).toBe("VALID");
		expect(c.liveApi).toEqual(["l"]);
	});

	test("GPU-only tests → needs-gpu (xarray CuPy)", () => {
		const c = classifyRuns(
			{ g: "skip-gpu" },
			{ g: "skip-gpu" },
			{ g: "skip-gpu" },
			deps,
		);
		expect(c.verdict).toBe("fail:needs-gpu");
	});

	test("gold crash: dependency-change when deps were touched, else pytest-crashed (D5)", () => {
		expect(
			classifyRuns({ a: "fail" }, null, null, { depsTouched: true }).verdict,
		).toBe("fail:dependency-change");
		expect(classifyRuns({ a: "fail" }, null, null, deps).verdict).toBe(
			"fail:pytest-crashed",
		);
	});
});

describe("junit parsing (task 3.3)", () => {
	test("outcomes, live-API failures and GPU skips are distinguished", () => {
		const xml = `<testsuites><testsuite>
			<testcase classname="tests.test_a" name="test_ok" time="0.1"/>
			<testcase classname="tests.test_a" name="test_bad"><failure message="assert 1 == 2">AssertionError</failure></testcase>
			<testcase classname="tests.test_a" name="test_live"><error message="x">litellm.APIConnectionError: proxy</error></testcase>
			<testcase classname="tests.test_cupy" name="test_gpu"><skipped message="could not import 'cupy'"/></testcase>
			<testcase classname="tests.test_a" name="test_skip"><skipped message="needs py3.14"/></testcase>
		</testsuite></testsuites>`;
		expect(parseJunit(xml)).toEqual({
			"tests.test_a::test_ok": "pass",
			"tests.test_a::test_bad": "fail",
			"tests.test_a::test_live": "fail-live",
			"tests.test_cupy::test_gpu": "skip-gpu",
			"tests.test_a::test_skip": "skip",
		});
	});
});
