import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getQueue, launchRun } from "../src/studio/launcher";

const REQ = {
	target: "cli-tool",
	candidates: ["superpowers"],
	harness: "claude-code",
	workerModel: "claude-opus-4-6",
	provider: "worktree",
	trials: 1,
	weights: {
		prdAdherence: 0.4,
		codeQuality: 0.25,
		speed: 0.175,
		tokenSpend: 0.175,
	},
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("eval-studio launch → status → review (task 4.2, dry run)", () => {
	test("a worktree dry run completes through the orchestrator and writes results", async () => {
		// Validation is enforced: bad request never launches.
		expect(launchRun({ ...REQ, candidates: [] }, { dryRun: true }).errors).toBeDefined();
		// Real (non-dry) launch is refused from the studio.
		expect(launchRun(REQ, { dryRun: false }).errors?.[0]).toMatch(/disabled/);

		const { runId, errors } = launchRun(REQ, { dryRun: true });
		expect(errors).toBeUndefined();
		expect(runId).toBeTruthy();
		const id = runId as string;

		// Poll the queue (3.4 live status) until the run reaches a terminal state.
		let entry = getQueue().find((e) => e.runId === id);
		for (let i = 0; i < 60 && entry?.status === "running"; i++) {
			await sleep(500);
			entry = getQueue().find((e) => e.runId === id);
		}
		expect(entry?.status).toBe("completed");
		expect(Object.values(entry?.trials ?? {})).toContain("completed");

		// Results + scorecard written; the review view reads these.
		const runDir = join("runs", id);
		try {
			expect(existsSync(join(runDir, "results.json"))).toBe(true);
			expect(existsSync(join(runDir, "scorecard.md"))).toBe(true);
			const results = JSON.parse(
				readFileSync(join(runDir, "results.json"), "utf8"),
			);
			expect(results.schemaVersion).toBe(1);
			expect(results.workerModel?.name).toBe("claude-opus-4-6");
			expect(results.trials[0].provenance.status).toBe("completed");
		} finally {
			rmSync(runDir, { recursive: true, force: true });
		}
	}, 40_000);
});
