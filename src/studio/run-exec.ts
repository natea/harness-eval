/**
 * Run execution body, shared by the in-process launcher path (tests + dry runs)
 * and the detached worker (`run-worker.ts`) for real runs. Extracted from the
 * launcher so a run can execute in its own process (add-live-run-durability):
 * the studio server resolves auth/budget, then either runs this inline (tests)
 * or spawns a worker that calls it, while both emit the same state updates.
 */
import { join } from "node:path";
import type { SessionScriptResult } from "../driver/session";
import {
	loadModels,
	resolveClaudeCodeEnv,
	resolveProfile,
	toModelRef,
} from "../models";
import { gradeTrials } from "../orchestrator/grade";
import {
	buildMatrix,
	runMatrix,
	type SchedulerDeps,
} from "../orchestrator/scheduler";
import { createProvider } from "../providers/factory";
import { WorktreeProvider } from "../providers/worktree";
import { loadRegistry, resolveCandidates } from "../registry";
import { writeScorecard } from "../report/markdown";
import { buildResults, writeResults } from "../report/results";
import { loadDesign } from "../designs";
import { loadTarget, renderTargetPrompt } from "../targets";
import { type HarnessId, type IsolationProviderId, RunConfig } from "../types";
import { defaultConcurrency, type StudioRunRequest } from "./options";
import type { RunStateStatus } from "./run-state";

/** Reject if `p` does not settle within `ms` — bounds in-process grading so a
 *  hung session can't wedge the run at "grading" forever. */
export function withTimeout<T>(
	p: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), ms);
	});
	return Promise.race([p, timeout]).finally(() =>
		clearTimeout(timer),
	) as Promise<T>;
}

/** Fake build: writes the cold-start contract, no real agent — zero spend. */
export const fakeExecutor = async (sandbox: {
	writeFile: (p: string, c: string) => Promise<void>;
}): Promise<SessionScriptResult> => {
	await sandbox.writeFile("setup.sh", "#!/bin/sh\nexit 0\n");
	await sandbox.writeFile("start.sh", "#!/bin/sh\nsleep 60\n");
	await sandbox.writeFile("artifact.txt", "studio dry run\n");
	return {
		records: [
			{
				sessionId: "studio-dry",
				stepIndex: 0,
				durationMs: 1000,
				numTurns: 1,
				costUsd: 0,
				usage: {
					inputTokens: 1,
					outputTokens: 1,
					cacheReadTokens: 0,
					cacheCreationTokens: 0,
				},
				isError: false,
			},
		],
		transcripts: ["{}"],
		status: "completed",
		cappedBy: null,
		notes: [],
	};
};

export function defaultProvider(provider: IsolationProviderId, runDir: string) {
	return createProvider(provider, {
		worktreeBaseDir: join(runDir, "sandboxes"),
	});
}

/** Everything a run needs, derived from the request (in either process). */
export function resolveRunInputs(r: StudioRunRequest) {
	const registry = loadRegistry("config/registry.yaml");
	const target = loadTarget(r.target);
	const design = r.design ? loadDesign(r.design) : null;
	registry.basePrompt = renderTargetPrompt(
		registry.basePrompt,
		target,
		design?.name,
	);
	const candidates = resolveCandidates(
		registry,
		r.candidates,
		r.harness as HarnessId,
	);
	const models = loadModels();
	const workerProfile = resolveProfile(r.workerModel, models);
	const judgeProfile = resolveProfile("claude-sonnet-4-6", models);
	let workerEnv: Record<string, string> | undefined;
	let workerModelFlag = workerProfile.modelId;
	if (workerProfile.provider !== "anthropic") {
		const resolved = resolveClaudeCodeEnv(workerProfile);
		workerEnv = resolved.env;
		workerModelFlag = resolved.modelFlag;
	}
	const config = RunConfig.parse({
		candidates: r.candidates,
		harness: r.harness,
		model: workerProfile.name,
		trialsPerCandidate: r.trials,
		provider: r.provider as IsolationProviderId,
		concurrency: r.concurrency ?? defaultConcurrency(r.provider),
		weights: r.weights,
	});
	return {
		registry,
		target,
		design,
		candidates,
		workerProfile,
		judgeProfile,
		workerEnv,
		workerModelFlag,
		config,
	};
}

/** Incremental state reported as the run progresses. */
export interface RunStateUpdate {
	status?: RunStateStatus;
	stage?: string | null;
	trials?: Record<string, string>;
	costUsdSoFar?: number;
	error?: string | null;
}

export interface ExecuteRunOpts {
	dryRun: boolean;
	abortSignal: AbortSignal;
	onUpdate: (u: RunStateUpdate) => void;
	/** Injected for tests (no real agent); undefined → real claude session. */
	executeScript?: SchedulerDeps["executeScript"];
	/** Injected for tests (no spend); undefined → real provider. */
	makeProvider?: (
		provider: IsolationProviderId,
		runDir: string,
	) => ReturnType<typeof createProvider>;
}

export interface ExecuteRunResult {
	status: "completed" | "error" | "cancelled";
	costUsd: number;
	builtAny: boolean;
}

/**
 * Execute one run (dry build-only, or live build + optional grade), writing
 * results + scorecard, and reporting progress through `onUpdate`. Pure with
 * respect to job tracking — the caller persists state and runs policy hooks.
 */
export async function executeRun(
	runId: string,
	runDir: string,
	r: StudioRunRequest,
	opts: ExecuteRunOpts,
): Promise<ExecuteRunResult> {
	const { dryRun, abortSignal, onUpdate } = opts;
	const inp = resolveRunInputs(r);
	let costUsd = 0;
	try {
		const provider: ReturnType<typeof createProvider> = dryRun
			? new WorktreeProvider(join(runDir, "sandboxes"))
			: (opts.makeProvider ?? defaultProvider)(inp.config.provider, runDir);
		if (!dryRun && provider.preflight)
			await provider.preflight({
				trialWallClockMs: inp.config.budget.trialWallClockMs,
				concurrency: inp.config.concurrency,
			});

		const startedAt = new Date().toISOString();
		onUpdate({ stage: "building" });
		const trials = await runMatrix(
			inp.config,
			buildMatrix(inp.candidates, inp.config.trialsPerCandidate),
			{
				provider,
				registry: inp.registry,
				runDir,
				prdContent: inp.target.prdContent,
				prdSha256: inp.target.prdSha256,
				testPlanSha256: inp.target.testPlanSha256,
				designContent: inp.design?.content,
				harnessVersion: dryRun ? "studio-dry" : "studio-live",
				workerEnv: dryRun ? undefined : inp.workerEnv,
				workerModelFlag: dryRun ? inp.workerProfile.modelId : inp.workerModelFlag,
				workerModelRef: toModelRef(inp.workerProfile),
				executeScript: dryRun
					? (fakeExecutor as never)
					: opts.executeScript,
				abortSignal,
				onStage: (_id, stage) => onUpdate({ stage }),
			},
		);
		const trialStatuses: Record<string, string> = {};
		for (const t of trials) {
			trialStatuses[t.provenance.trialId] = t.provenance.status;
			costUsd += t.telemetry?.totalCostUsd ?? 0;
		}
		onUpdate({ trials: { ...trialStatuses }, costUsdSoFar: costUsd });

		if (!dryRun && r.grade && !abortSignal.aborted) {
			onUpdate({ stage: "grading" });
			const graded = trials.filter(
				(t) => t.provenance.status === "completed",
			).length;
			const gradeTimeoutMs = Math.max(graded, 1) * 30 * 60_000;
			await withTimeout(
				gradeTrials(trials, {
					target: inp.target,
					design: inp.design,
					registry: inp.registry,
					judgeModel: inp.judgeProfile.name,
					runDir,
					signal: abortSignal,
					onStage: (stage) => onUpdate({ stage }),
				}),
				gradeTimeoutMs,
				`grading exceeded ${Math.round(gradeTimeoutMs / 60_000)}m — re-grade with scripts/grade-trial.ts then scripts/finalize-run.ts`,
			);
		}

		onUpdate({ stage: "finalizing" });
		const results = buildResults({
			runId,
			config: inp.config,
			prdSha256: inp.target.prdSha256,
			testPlanSha256: inp.target.testPlanSha256,
			startedAt,
			endedAt: new Date().toISOString(),
			trials,
			workerModel: toModelRef(inp.workerProfile),
			judgeModel: toModelRef(inp.judgeProfile),
			crossVendorJudge:
				inp.workerProfile.provider !== inp.judgeProfile.provider,
			costSource: dryRun ? "tokens-only" : "harness-reported",
		});
		writeResults(runDir, results);
		writeScorecard(runDir, results);

		const status = abortSignal.aborted ? "cancelled" : "completed";
		onUpdate({ status, stage: null });
		return {
			status,
			costUsd,
			builtAny: trials.some((t) => t.provenance.status === "completed"),
		};
	} catch (e) {
		onUpdate({ status: "error", error: String(e).slice(0, 300), stage: null });
		return { status: "error", costUsd, builtAny: false };
	}
}
