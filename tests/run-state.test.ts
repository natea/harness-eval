import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import {
	isPidAlive,
	listRunStates,
	type RunState,
	readRunState,
	reconcileRunStates,
	writeRunState,
} from "../src/studio/run-state";

const root = mkdtempSync(join(tmpdir(), "he-runstate-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function state(runId: string, over: Partial<RunState> = {}): RunState {
	return {
		runId,
		kind: "live",
		status: "running",
		stage: "building",
		candidates: ["superpowers"],
		trials: { "superpowers-t1": "running" },
		costUsdSoFar: 0,
		startedAt: "2026-06-15T00:00:00.000Z",
		updatedAt: "2026-06-15T00:00:00.000Z",
		ownerPid: process.pid,
		error: null,
		...over,
	};
}

test("run-state round-trips through disk", () => {
	const runDir = join(root, "run-a");
	const s = state("run-a", { stage: "scoring superpowers-t1 (1/2)" });
	writeRunState(runDir, s);
	expect(readRunState(runDir)).toEqual(s);
});

test("readRunState returns null when absent or malformed", () => {
	expect(readRunState(join(root, "nope"))).toBeNull();
});

test("isPidAlive: own pid alive, absurd pid dead", () => {
	expect(isPidAlive(process.pid)).toBe(true);
	expect(isPidAlive(2_147_483_646)).toBe(false);
	expect(isPidAlive(0)).toBe(false);
});

test("reconcile relabels dead-owner running runs as interrupted, leaves live ones", () => {
	const runs = join(root, "reconcile");
	writeRunState(join(runs, "dead"), state("dead", { ownerPid: 2_147_483_646 }));
	writeRunState(join(runs, "alive"), state("alive", { ownerPid: process.pid }));
	writeRunState(
		join(runs, "done"),
		state("done", { status: "completed", ownerPid: 2_147_483_646 }),
	);

	const reconciled = reconcileRunStates(runs, "2026-06-15T01:00:00.000Z");

	expect(reconciled).toEqual(["dead"]);
	expect(readRunState(join(runs, "dead"))?.status).toBe("interrupted");
	expect(readRunState(join(runs, "alive"))?.status).toBe("running");
	// terminal states are never touched
	expect(readRunState(join(runs, "done"))?.status).toBe("completed");
	expect(listRunStates(runs)).toHaveLength(3);
});
