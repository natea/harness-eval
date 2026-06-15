/**
 * Studio run launcher (eval-studio). Validates + authorizes a run, then either
 * executes it **in-process** (dry runs and injected-executor test runs) or in a
 * **detached worker process** (real runs) so a studio UI restart/crash does not
 * kill the build/grade (add-live-run-durability). Live state is mirrored to
 * `run-state.json` per run so the Runs view survives losing the in-memory queue.
 */
import { spawn } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SchedulerDeps } from "../orchestrator/scheduler";
import { createProvider } from "../providers/factory";
import type { IsolationProviderId } from "../types";
import {
	defaultConcurrency,
	type StudioRunRequest,
	type ValidationResult,
	validateRunRequest,
} from "./options";
import {
	type LaunchPolicy,
	operatorPrincipal,
	type Principal,
	resolveLaunchPolicy,
} from "./policy";
import { executeRun, type RunStateUpdate } from "./run-exec";
import {
	listRunStates,
	readRunState,
	type RunState,
	type RunStateStatus,
	RUNS_DIR,
	writeRunState,
} from "./run-state";

export interface QueueEntry {
	runId: string;
	kind: "dry" | "live";
	status: RunStateStatus;
	startedAt: string;
	candidates: string[];
	trials: Record<string, string>;
	costUsdSoFar: number;
	stage?: string;
	error?: string;
}

interface JobControl {
	entry: QueueEntry;
	abort: AbortController;
}

const jobs = new Map<string, JobControl>();

function stateToEntry(s: RunState): QueueEntry {
	return {
		runId: s.runId,
		kind: s.kind,
		status: s.status,
		startedAt: s.startedAt,
		candidates: s.candidates,
		trials: s.trials,
		costUsdSoFar: s.costUsdSoFar,
		stage: s.stage ?? undefined,
		error: s.error ?? undefined,
	};
}

/**
 * Live status of studio runs: in-memory jobs (in-process runs this server owns)
 * merged with on-disk run-state (detached runs + runs whose owner died). The
 * in-memory entry wins; disk surfaces detached/interrupted runs the queue can't
 * see, so a run never silently vanishes from the Runs view.
 */
export function getQueue(): QueueEntry[] {
	const inMemory = [...jobs.values()].map((j) => j.entry);
	const ids = new Set(inMemory.map((e) => e.runId));
	const fromDisk = listRunStates()
		.filter((s) => !ids.has(s.runId))
		// Surface every non-completed disk run: running + interrupted, but also
		// error/cancelled. A failed or cancelled detached run has no results.json,
		// so /api/runs can't show it — without this it would silently vanish (the
		// exact bug this change exists to prevent). Completed runs are shown via
		// /api/runs from their results.json.
		.filter((s) => s.status !== "completed")
		.map(stateToEntry);
	return [...inMemory, ...fromDisk].sort((a, b) =>
		b.startedAt.localeCompare(a.startedAt),
	);
}

export type LaunchResult =
	| { runId: string }
	| { errors: string[] }
	| {
			needsConfirmation: true;
			budget: ValidationResult["budget"];
			command?: string;
	  };

export interface LaunchDeps {
	policy?: LaunchPolicy;
	principal?: Principal;
	/** Injectable provider for tests (no spend); presence ⇒ in-process execution. */
	makeProvider?: (
		provider: IsolationProviderId,
		runDir: string,
	) => ReturnType<typeof createProvider>;
	/** Injectable session executor for tests (no real agent); presence ⇒ in-process. */
	executeScript?: SchedulerDeps["executeScript"];
}

/**
 * Launch a run through the orchestrator (eval-studio run-launch).
 *
 * - **dry run** (worktree + fake executor, zero spend) launches immediately.
 * - **real run** must clear authorization (`canLaunch`) and an acknowledged
 *   budget confirmation (`req.confirmed`) before any sandbox is provisioned.
 *   Missing confirmation returns `needsConfirmation` rather than launching.
 *
 * Returns the runId immediately; the run executes as a tracked job (in-process
 * for tests/dry, a detached worker for real runs).
 */
export async function launchRun(
	req: Partial<StudioRunRequest>,
	opts: { dryRun: boolean } & LaunchDeps = { dryRun: true },
): Promise<LaunchResult> {
	const v = validateRunRequest(req);
	if (v.errors.length) return { errors: v.errors };
	const r = req as StudioRunRequest;

	if (opts.dryRun) return launchDry(r);

	const policy = opts.policy ?? resolveLaunchPolicy();
	const principal = opts.principal ?? operatorPrincipal(r.operatorToken);
	const decision = await policy.canLaunch(principal, r);
	if (!decision.ok) return { errors: [decision.reason] };

	if (!r.confirmed)
		return { needsConfirmation: true, budget: v.budget, command: v.command };

	return launchLive(r, policy, principal, opts);
}

function newRunId(suffix: string): { runId: string; runDir: string } {
	const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}${suffix}`;
	const runDir = join(RUNS_DIR, runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });
	return { runId, runDir };
}

function initialState(
	runId: string,
	kind: "dry" | "live",
	r: StudioRunRequest,
	ownerPid: number,
	stage: string | null,
): RunState {
	const now = new Date().toISOString();
	return {
		runId,
		kind,
		status: "running",
		stage,
		candidates: r.candidates,
		trials: {},
		costUsdSoFar: 0,
		startedAt: now,
		updatedAt: now,
		ownerPid,
		error: null,
	};
}

function applyToEntry(entry: QueueEntry, u: RunStateUpdate): void {
	if (u.status !== undefined) entry.status = u.status;
	if (u.stage !== undefined) entry.stage = u.stage ?? undefined;
	if (u.trials !== undefined) entry.trials = { ...entry.trials, ...u.trials };
	if (u.costUsdSoFar !== undefined) entry.costUsdSoFar = u.costUsdSoFar;
	if (u.error !== undefined) entry.error = u.error ?? undefined;
}

function entryToState(
	entry: QueueEntry,
	startedAt: string,
	ownerPid: number,
): RunState {
	return {
		runId: entry.runId,
		kind: entry.kind,
		status: entry.status,
		stage: entry.stage ?? null,
		candidates: entry.candidates,
		trials: entry.trials,
		costUsdSoFar: entry.costUsdSoFar,
		startedAt,
		updatedAt: new Date().toISOString(),
		ownerPid,
		error: entry.error ?? null,
	};
}

/** Execute a run inside this process (dry runs and injected-executor tests). */
function runInProcess(
	runId: string,
	runDir: string,
	r: StudioRunRequest,
	kind: "dry" | "live",
	opts: { dryRun: boolean } & LaunchDeps,
	hooks?: {
		onLaunched?: () => Promise<void> | void;
		onSettled?: (res: {
			status: "completed" | "error" | "cancelled";
			costUsd: number;
			builtAny: boolean;
		}) => Promise<void> | void;
	},
): void {
	const abort = new AbortController();
	const entry: QueueEntry = {
		runId,
		kind,
		status: "running",
		startedAt: new Date().toISOString(),
		candidates: r.candidates,
		trials: {},
		costUsdSoFar: 0,
	};
	jobs.set(runId, { entry, abort });
	const persist = () =>
		writeRunState(runDir, entryToState(entry, entry.startedAt, process.pid));
	persist();

	void (async () => {
		await hooks?.onLaunched?.();
		const res = await executeRun(runId, runDir, r, {
			dryRun: opts.dryRun,
			abortSignal: abort.signal,
			executeScript: opts.executeScript,
			makeProvider: opts.makeProvider,
			onUpdate: (u) => {
				applyToEntry(entry, u);
				persist();
			},
		});
		if (entry.status === "running") {
			entry.status = res.status;
			persist();
		}
		await hooks?.onSettled?.(res);
	})();
}

/** Spawn the run in a detached worker process (real runs). */
function spawnDetached(
	runId: string,
	runDir: string,
	r: StudioRunRequest,
	policy: LaunchPolicy,
	principal: Principal,
): void {
	writeFileSync(
		join(runDir, "job.json"),
		`${JSON.stringify({ request: r, dryRun: false }, null, 2)}\n`,
	);
	writeRunState(runDir, initialState(runId, "live", r, 0, "starting"));

	const log = openSync(join(runDir, "run.log"), "a");
	const child = spawn("bun", ["src/studio/run-worker.ts", runDir], {
		detached: true,
		stdio: ["ignore", log, log],
		env: process.env,
	});
	// Record the worker pid so the server can find/signal it; the worker also
	// self-stamps its pid on startup (authoritative if `bun` re-execs).
	const st = readRunState(runDir);
	if (st) writeRunState(runDir, { ...st, ownerPid: child.pid ?? 0 });
	child.unref();

	void Promise.resolve(policy.onLaunched?.(principal, runId, r)).catch(
		() => {},
	);
	child.on("exit", () => {
		const final = readRunState(runDir);
		const builtAny = final
			? Object.values(final.trials).some((s) => s === "completed")
			: false;
		const status =
			final?.status === "completed" ||
			final?.status === "cancelled" ||
			final?.status === "error"
				? final.status
				: "error";
		void Promise.resolve(
			policy.onSettled?.(principal, runId, {
				status,
				costUsd: final?.costUsdSoFar ?? 0,
				noBillableWork: !builtAny,
			}),
		).catch(() => {});
	});
}

function launchDry(r: StudioRunRequest): { runId: string } {
	const { runId, runDir } = newRunId("-dry");
	runInProcess(runId, runDir, r, "dry", { dryRun: true });
	return { runId };
}

function launchLive(
	r: StudioRunRequest,
	policy: LaunchPolicy,
	principal: Principal,
	opts: LaunchDeps,
): { runId: string } {
	const { runId, runDir } = newRunId("");
	// Tests inject an executor/provider → run in-process so they can drive and
	// observe it; real runs (no injectables) execute in a detached worker.
	if (opts.executeScript || opts.makeProvider) {
		runInProcess(runId, runDir, r, "live", { dryRun: false, ...opts }, {
			onLaunched: () => policy.onLaunched?.(principal, runId, r),
			onSettled: (res) =>
				policy.onSettled?.(principal, runId, {
					status: res.status,
					costUsd: res.costUsd,
					noBillableWork: !res.builtAny,
				}),
		});
	} else {
		spawnDetached(runId, runDir, r, policy, principal);
	}
	return { runId };
}

/**
 * Cancel a running job. In-process jobs abort between trials (the trial's own
 * teardown tears down the sandbox). Detached jobs are signalled (SIGTERM) so the
 * worker aborts and tears down through the provider — a cancelled run leaks nothing.
 */
export function cancelRun(runId: string): { ok: boolean; error?: string } {
	const job = jobs.get(runId);
	if (job) {
		if (job.entry.status !== "running")
			return { ok: false, error: `run is ${job.entry.status}` };
		job.abort.abort();
		return { ok: true };
	}
	const st = readRunState(join(RUNS_DIR, runId));
	if (!st) return { ok: false, error: "no such run" };
	if (st.status !== "running")
		return { ok: false, error: `run is ${st.status}` };
	try {
		process.kill(st.ownerPid, "SIGTERM");
		return { ok: true };
	} catch {
		return { ok: false, error: "owner process not reachable" };
	}
}
