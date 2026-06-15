import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import { getQueue } from "../src/studio/launcher";
import type { StudioRunRequest } from "../src/studio/options";
import {
	type RunState,
	readRunState,
	reconcileRunStates,
	writeRunState,
} from "../src/studio/run-state";

const uniq = `${process.pid}-${performance.now().toString().replace(".", "")}`;
const created: string[] = [];
afterAll(() => {
	for (const id of created) rmSync(join("runs", id), { recursive: true, force: true });
});

function makeRunDir(tag: string): { runId: string; runDir: string } {
	const runId = `he-dur-${tag}-${uniq}`;
	const runDir = join("runs", runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });
	created.push(runId);
	return { runId, runDir };
}

const DRY_REQ: StudioRunRequest = {
	target: "cli-tool",
	candidates: ["superpowers"],
	harness: "claude-code",
	workerModel: "claude-opus-4-6",
	provider: "worktree",
	trials: 1,
	weights: { prdAdherence: 0.4, codeQuality: 0.25, speed: 0.175, tokenSpend: 0.175 },
};

test("6.2 interrupted run (dead owner, no results.json) is reconciled and surfaced by getQueue", () => {
	const { runId, runDir } = makeRunDir("interrupted");
	const state: RunState = {
		runId,
		kind: "live",
		status: "running",
		stage: "building",
		candidates: ["superpowers", "agent-skills"],
		trials: { "superpowers-t1": "completed", "agent-skills-t1": "running" },
		costUsdSoFar: 0,
		startedAt: "2026-06-15T03:00:46.945Z",
		updatedAt: "2026-06-15T03:03:29.081Z",
		ownerPid: 2_147_483_646, // dead
		error: null,
	};
	writeRunState(runDir, state);

	// Before reconcile it is recorded running; after reconcile (server startup)
	// it becomes interrupted because its owner is gone.
	expect(reconcileRunStates()).toContain(runId);
	expect(readRunState(runDir)?.status).toBe("interrupted");

	const row = getQueue().find((e) => e.runId === runId);
	expect(row).toBeDefined();
	expect(row?.status).toBe("interrupted");
	expect(row?.trials["superpowers-t1"]).toBe("completed");
	expect(existsSync(join(runDir, "results.json"))).toBe(false);
});

test("an errored detached run (no results.json) stays visible in getQueue", () => {
	const { runId, runDir } = makeRunDir("errored");
	writeRunState(runDir, {
		runId,
		kind: "live",
		status: "error",
		stage: null,
		candidates: ["superpowers"],
		trials: { "superpowers-t1": "completed" },
		costUsdSoFar: 0.46,
		startedAt: "2026-06-15T14:26:19.012Z",
		updatedAt: "2026-06-15T14:27:55.096Z",
		ownerPid: 2_147_483_646,
		error: "400 invalid_request_error: credit balance too low",
	});
	const row = getQueue().find((e) => e.runId === runId);
	expect(row?.status).toBe("error");
	expect(row?.error).toContain("credit balance");
	expect(existsSync(join(runDir, "results.json"))).toBe(false);
});

test(
	"6.3 a dry run executes in the detached worker and completes on its own",
	async () => {
		const { runId, runDir } = makeRunDir("smoke");
		writeFileSync(
			join(runDir, "job.json"),
			JSON.stringify({ request: DRY_REQ, dryRun: true }, null, 2),
		);

		// Spawn the worker detached, exactly as the launcher does for real runs.
		const log = require("node:fs").openSync(join(runDir, "run.log"), "a");
		const child = spawn("bun", ["src/studio/run-worker.ts", runDir], {
			detached: true,
			stdio: ["ignore", log, log],
		});
		child.unref();

		// Poll on-disk state — the studio server would read exactly this.
		let state = readRunState(runDir);
		for (let i = 0; i < 120 && (!state || state.status === "running"); i++) {
			await new Promise((r) => setTimeout(r, 500));
			state = readRunState(runDir);
		}

		expect(state?.status).toBe("completed");
		expect(state?.ownerPid).toBeGreaterThan(0);
		expect(existsSync(join(runDir, "results.json"))).toBe(true);
		expect(existsSync(join(runDir, "scorecard.md"))).toBe(true);
	},
	90_000,
);
