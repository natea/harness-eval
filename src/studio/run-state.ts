/**
 * Durable live-run state (add-live-run-durability).
 *
 * The studio's in-memory job queue is volatile: a server restart/crash loses it,
 * and a run that never wrote results.json then vanishes from the Runs view. This
 * module persists a lightweight per-run state record (`run-state.json`) under the
 * run directory so an in-flight or interrupted run stays visible and recoverable,
 * independent of which process owns it.
 *
 * It is also the local-dev backend of a future `RunStore` abstraction: if the
 * harness ever becomes a multi-tenant hosted service, the same lifecycle/state
 * ports to a job-queue/DB backend (see the change's design.md decision record).
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const RUNS_DIR = "runs";

export const RunStateStatus = z.enum([
	"running",
	"completed",
	"error",
	"cancelled",
	/** Owner process died mid-flight; set by reconciliation, never by the owner. */
	"interrupted",
]);
export type RunStateStatus = z.infer<typeof RunStateStatus>;

export const RunState = z.object({
	runId: z.string(),
	kind: z.enum(["dry", "live"]),
	status: RunStateStatus,
	/** Coarse current phase (e.g. "building", "scoring superpowers-t1 (1/2)"). */
	stage: z.string().nullable().default(null),
	candidates: z.array(z.string()),
	/** trialId → terminal/interim status. */
	trials: z.record(z.string(), z.string()).default({}),
	costUsdSoFar: z.number().nonnegative().default(0),
	startedAt: z.string(),
	updatedAt: z.string(),
	/** PID of the process executing the run (server for in-process; worker for detached). */
	ownerPid: z.number().int().nonnegative(),
	error: z.string().nullable().default(null),
});
export type RunState = z.infer<typeof RunState>;

export function runStatePath(runDir: string): string {
	return join(runDir, "run-state.json");
}

export function writeRunState(runDir: string, state: RunState): void {
	mkdirSync(runDir, { recursive: true });
	writeFileSync(runStatePath(runDir), `${JSON.stringify(state, null, 2)}\n`);
}

export function readRunState(runDir: string): RunState | null {
	const p = runStatePath(runDir);
	if (!existsSync(p)) return null;
	try {
		return RunState.parse(JSON.parse(readFileSync(p, "utf8")));
	} catch {
		return null;
	}
}

/** Liveness check by pid. EPERM means the pid exists but isn't ours (still alive). */
export function isPidAlive(pid: number): boolean {
	if (!pid || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** All persisted run states under `runsDir`, newest first. */
export function listRunStates(runsDir: string = RUNS_DIR): RunState[] {
	if (!existsSync(runsDir)) return [];
	const out: RunState[] = [];
	for (const name of readdirSync(runsDir)) {
		const st = readRunState(join(runsDir, name));
		if (st) out.push(st);
	}
	return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * Relabel any in-progress state whose owning process is gone to `interrupted`.
 * Only relabels — never re-executes. Returns the run ids reconciled.
 */
export function reconcileRunStates(
	runsDir: string = RUNS_DIR,
	now: string = new Date().toISOString(),
): string[] {
	const reconciled: string[] = [];
	for (const st of listRunStates(runsDir)) {
		if (st.status === "running" && !isPidAlive(st.ownerPid)) {
			writeRunState(join(runsDir, st.runId), {
				...st,
				status: "interrupted",
				updatedAt: now,
			});
			reconciled.push(st.runId);
		}
	}
	return reconciled;
}
