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
		const bad = await launchRun({ ...REQ, candidates: [] }, { dryRun: true });
		expect("errors" in bad && bad.errors).toBeTruthy();
		// A real (non-dry) launch without confirmation returns the budget to
		// review and starts nothing — no real spend from a test.
		const unconfirmed = await launchRun(REQ, { dryRun: false });
		expect("needsConfirmation" in unconfirmed).toBe(true);
		// A denying policy refuses the real launch with its reason.
		const denied = await launchRun(REQ, {
			dryRun: false,
			policy: {
				async canLaunch() {
					return { ok: false, reason: "nope" };
				},
			},
		});
		expect("errors" in denied && denied.errors[0]).toBe("nope");

		const started = await launchRun(REQ, { dryRun: true });
		expect("runId" in started).toBe(true);
		const id = (started as { runId: string }).runId;
		expect(id).toBeTruthy();

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
