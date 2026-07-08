/**
 * Run execution body, shared by the in-process launcher path (tests + dry runs)
 * and the detached worker (`run-worker.ts`) for real runs. Extracted from the
 * launcher so a run can execute in its own process (add-live-run-durability):
 * the studio server resolves auth/budget, then either runs this inline (tests)
 * or spawns a worker that calls it, while both emit the same state updates.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { loadDesign } from "../designs";
import type { SessionScriptResult } from "../driver/session";
import { loadHarnesses } from "../harnesses";
import {
	type CostSource,
	costSourceForHarness,
	loadModels,
	type ModelProfile,
	resolveProfile,
	resolveWorkerEnv,
	toModelRef,
} from "../models";
import { gradeTrials, type GradeDeps } from "../orchestrator/grade";
import {
	buildMatrix,
	runMatrix,
	type SchedulerDeps,
} from "../orchestrator/scheduler";
import {
	createProvider,
	preflightProbeForHarness,
	resolveProviderSnapshot,
} from "../providers/factory";
import { WorktreeProvider } from "../providers/worktree";
import { loadRegistry, resolveCandidates } from "../registry";
import { writeScorecard } from "../report/markdown";
import { buildResults, writeResults } from "../report/results";
import { loadTarget, renderTargetPrompt } from "../targets";
import {
	type CandidateEntry,
	type HarnessId,
	type IsolationProviderId,
	RunConfig,
} from "../types";
import { defaultConcurrency, type StudioRunRequest } from "./options";
import type { RunStateStatus } from "./run-state";

const DEFAULTS_PATH = "config/run.defaults.yaml";

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

export function defaultProvider(
	provider: IsolationProviderId,
	harness: HarnessId,
	runDir: string,
) {
	return createProvider(provider, {
		snapshot: resolveProviderSnapshot(provider, harness),
		worktreeBaseDir: join(runDir, "sandboxes"),
	});
}

export function studioCostSource(
	dryRun: boolean,
	profile: ModelProfile,
	reportsCost: boolean,
): CostSource {
	return dryRun ? "tokens-only" : costSourceForHarness(profile, reportsCost);
}

export function stripInstallStepsForDryRun(
	candidates: CandidateEntry[],
	harness: HarnessId,
): CandidateEntry[] {
	return candidates.map((candidate) => {
		const setup = candidate.harnesses[harness];
		if (!setup) return candidate;
		return {
			...candidate,
			harnesses: {
				...candidate.harnesses,
				[harness]: {
					...setup,
					install: [],
				},
			},
		};
	});
}

/** Everything a run needs, derived from the request (in either process). */
export function resolveRunInputs(r: StudioRunRequest) {
	const harnesses = loadHarnesses();
	const registry = loadRegistry("config/registry.yaml", harnesses);
	const defaults = existsSync(DEFAULTS_PATH)
		? (parse(readFileSync(DEFAULTS_PATH, "utf8")) as Record<string, unknown>)
		: {};
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
		harnesses,
	);
	const models = loadModels();
	const workerProfile = resolveProfile(r.workerModel, models);
	const judgeProfile = resolveProfile(
		r.judgeModel ?? "claude-sonnet-4-6",
		models,
	);
	// Single shared resolver (handles codex/oauth/api-key/third-party/native) so
	// the studio and CLI run paths can't drift.
	const rw = resolveWorkerEnv(workerProfile);
	const workerEnv = rw.env;
	const workerModelFlag = rw.modelFlag;
	const workerOssProvider = rw.ossProvider;
	const baseBudget =
		(defaults.budget as Record<string, unknown> | undefined) ?? {};
	const budget =
		r.trialMinutes !== undefined
			? { ...baseBudget, trialWallClockMs: Number(r.trialMinutes) * 60_000 }
			: baseBudget;
	const config = RunConfig.parse({
		...(Object.keys(budget).length ? { budget } : {}),
		candidates: r.candidates,
		harness: r.harness,
		model: workerProfile.name,
		judgeModel: judgeProfile.name,
		trialsPerCandidate: r.trials,
		provider: r.provider as IsolationProviderId,
		concurrency: r.concurrency ?? defaultConcurrency(r.provider),
		weights: r.weights,
	});
	const harnessReportsCost = harnesses.get(config.harness)?.reportsCost ?? true;
	return {
		registry,
		target,
		design,
		candidates,
		workerProfile,
		judgeProfile,
		workerEnv,
		workerModelFlag,
		workerOssProvider,
		harnessReportsCost,
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
	/** Injected for tests so Studio grading can be exercised without model spend. */
	gradeDeps?: Partial<GradeDeps>;
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
			: opts.makeProvider
				? opts.makeProvider(inp.config.provider, runDir)
				: defaultProvider(inp.config.provider, inp.config.harness, runDir);
		if (!dryRun && provider.preflight)
			await provider.preflight({
				trialWallClockMs: inp.config.budget.trialWallClockMs,
				concurrency: inp.config.concurrency,
				requiredProbe: preflightProbeForHarness(inp.config.harness),
			});

			const startedAt = new Date().toISOString();
			onUpdate({ stage: "building" });
			// Synthetic Studio runs (dry runs and injected-executor tests) exercise the
			// orchestration/reporting lifecycle, not framework installation. Running the
			// real candidate install here would make zero-spend checks depend on networked
			// plugin installers before the fake executor ever gets control.
			const skipCandidateInstalls = dryRun || opts.executeScript !== undefined;
			const candidates = skipCandidateInstalls
				? stripInstallStepsForDryRun(inp.candidates, inp.config.harness)
				: inp.candidates;
			const trials = await runMatrix(
				inp.config,
				buildMatrix(candidates, inp.config.trialsPerCandidate),
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
				workerModelFlag: dryRun
					? inp.workerProfile.modelId
					: inp.workerModelFlag,
				workerOssProvider: dryRun ? undefined : inp.workerOssProvider,
				workerModelRef: toModelRef(inp.workerProfile),
				executeScript: dryRun ? (fakeExecutor as never) : opts.executeScript,
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
			// gradeTrials self-bounds each trial (per-trial timeout) and never throws
			// on a slow/failed trial — it leaves that trial ungraded and continues, so
			// the run always reaches finalize with the grades that completed (the build
			// spend is never lost to a grading timeout). Ungraded trials are re-graded
			// later with scripts/grade-trial.ts + scripts/finalize-run.ts.
			await gradeTrials(trials, {
				target: inp.target,
				design: inp.design,
				registry: inp.registry,
				judgeModel: inp.judgeProfile.name,
				judgeProfile: inp.judgeProfile,
				runDir,
				signal: abortSignal,
				onStage: (stage) => onUpdate({ stage }),
				// Grade on the Claude Code subscription, not the Anthropic API account.
				driver: "cc",
				deps: opts.gradeDeps,
			});
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
			costSource: studioCostSource(
				dryRun,
				inp.workerProfile,
				inp.harnessReportsCost,
			),
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
