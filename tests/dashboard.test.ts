import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRunIndex } from "../src/dashboard/data";
import { composite } from "../src/grading/scoring";

const tmp = mkdtempSync(join(tmpdir(), "he-dash-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("dashboard run index (tasks 1.1/1.2)", () => {
	test("loads real combined run; unsupported schema gated; junk tolerated", () => {
		const runsDir = join(tmp, "runs");
		mkdirSync(join(runsDir, "run-bad"), { recursive: true });
		writeFileSync(
			join(runsDir, "run-bad", "results.json"),
			JSON.stringify({ schemaVersion: 99, runId: "run-bad" }),
		);
		mkdirSync(join(runsDir, "run-junk"), { recursive: true });
		writeFileSync(join(runsDir, "run-junk", "results.json"), "not json");
		cpSync("runs/combined-n1", join(runsDir, "combined-n1"), {
			recursive: true,
		});

		const index = loadRunIndex(runsDir);
		expect(index).toHaveLength(3);
		const bad = index.find((e) => e.runId === "run-bad");
		expect(bad?.supported).toBe(false);
		expect(bad?.error).toContain("unsupported schemaVersion 99");
		const junk = index.find((e) => e.runId === "run-junk");
		expect(junk?.supported).toBe(false);
		const good = index.find((e) => e.runId?.startsWith("combined"));
		expect(good?.supported).toBe(true);
		expect(good?.results?.scores.length).toBeGreaterThanOrEqual(3);
	});

	test("re-weighting parity: dashboard composite === CLI composite (task 1.1)", () => {
		const index = loadRunIndex("runs");
		const real = index.find(
			(e) => e.supported && e.results && e.results.scores.length > 0,
		);
		if (!real?.results)
			throw new Error("no supported run found for parity test");
		for (const s of real.results.scores) {
			// Same shared module the CLI used to produce the stored composite.
			expect(composite(s.dimensions, real.results.weights)).toBe(s.composite);
		}
	});
});
