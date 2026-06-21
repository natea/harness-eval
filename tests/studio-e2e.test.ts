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

// The worktree dry-run sets up a worktree and runs the orchestrator, which is
// slow-but-correct on a loaded machine (e.g. back-to-back with the full suite).
// A fixed 30s budget read a still-`running` run as a failure (issue #33), so the
// budget is env-overridable and defaults above 30s. The bun test timeout is kept
// above the poll budget so a genuine hang still surfaces as a clear message.
const POLL_BUDGET_MS = Number(process.env.STUDIO_E2E_POLL_MS ?? 90_000);
const TEST_TIMEOUT_MS = POLL_BUDGET_MS + 15_000;

describe("eval-studio launch → status → review (task 4.2, dry run)", () => {
	test(
		"a worktree dry run completes through the orchestrator and writes results",
		async () => {
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

			// Poll the queue (3.4 live status) until the run reaches a terminal state,
			// using a wall-clock deadline so a slow scheduler tick can't shrink the
			// effective budget. Distinguish "still running at the deadline" (a timeout,
			// likely environmental) from "reached a non-completed terminal state".
			let entry = getQueue().find((e) => e.runId === id);
			const deadline = Date.now() + POLL_BUDGET_MS;
			while (entry?.status === "running" && Date.now() < deadline) {
				await sleep(500);
				entry = getQueue().find((e) => e.runId === id);
			}
			if (entry?.status === "running") {
				throw new Error(
					`Timed out after ${POLL_BUDGET_MS}ms waiting for run ${id} to leave ` +
						`"running"; the worktree dry-run is slow-but-correct under load. ` +
						`Raise the budget via STUDIO_E2E_POLL_MS if this is environmental.`,
				);
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
		},
		TEST_TIMEOUT_MS,
	);
});
