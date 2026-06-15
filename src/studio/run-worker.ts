#!/usr/bin/env bun
/**
 * Detached run worker (add-live-run-durability). The studio server spawns this
 * in its own process group for a real run so a studio UI restart/crash does not
 * kill the build/grade. Reads `runs/<runId>/job.json`, executes the run via the
 * shared `executeRun` body, and writes `run-state.json` throughout. SIGTERM →
 * graceful cancel (abort → the scheduler tears down any in-flight sandbox).
 *
 *   bun src/studio/run-worker.ts runs/<runId>
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { StudioRunRequest } from "./options";
import { executeRun, type RunStateUpdate } from "./run-exec";
import { type RunState, readRunState, writeRunState } from "./run-state";

const runDir: string = process.argv[2] ?? "";
if (!runDir) {
	console.error("usage: run-worker <runDir>");
	process.exit(2);
}
const runId = basename(runDir);
const job = JSON.parse(readFileSync(join(runDir, "job.json"), "utf8")) as {
	request: StudioRunRequest;
	dryRun: boolean;
};

const abort = new AbortController();
process.on("SIGTERM", () => abort.abort());
process.on("SIGINT", () => abort.abort());

function current(): RunState {
	return (
		readRunState(runDir) ?? {
			runId,
			kind: job.dryRun ? "dry" : "live",
			status: "running",
			stage: null,
			candidates: job.request.candidates,
			trials: {},
			costUsdSoFar: 0,
			startedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			ownerPid: process.pid,
			error: null,
		}
	);
}

function apply(u: RunStateUpdate): void {
	const cur = current();
	writeRunState(runDir, {
		...cur,
		...(u.status !== undefined ? { status: u.status } : {}),
		...(u.stage !== undefined ? { stage: u.stage } : {}),
		...(u.trials !== undefined
			? { trials: { ...cur.trials, ...u.trials } }
			: {}),
		...(u.costUsdSoFar !== undefined ? { costUsdSoFar: u.costUsdSoFar } : {}),
		...(u.error !== undefined ? { error: u.error } : {}),
		updatedAt: new Date().toISOString(),
	});
}

// Take ownership: stamp our pid so the server can find/signal us.
writeRunState(runDir, {
	...current(),
	ownerPid: process.pid,
	status: "running",
	updatedAt: new Date().toISOString(),
});

const result = await executeRun(runId, runDir, job.request, {
	dryRun: job.dryRun,
	abortSignal: abort.signal,
	onUpdate: apply,
});

// executeRun already reported the terminal status via onUpdate; backstop it.
if (current().status === "running") apply({ status: result.status });
process.exit(result.status === "error" ? 1 : 0);
