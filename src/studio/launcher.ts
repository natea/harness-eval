import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type LoadedDesign, loadDesign } from "../designs";
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
import { loadTarget, renderTargetPrompt } from "../targets";
import { type HarnessId, type IsolationProviderId, RunConfig } from "../types";
import {
	type StudioRunRequest,
	type ValidationResult,
	validateRunRequest,
} from "./options";
import {
	type LaunchPolicy,
	operatorPrincipal,
	type Principal,
	type RunOutcome,
	resolveLaunchPolicy,
} from "./policy";

export interface QueueEntry {
	runId: string;
	kind: "dry" | "live";
	status: "running" | "completed" | "error" | "cancelled";
	startedAt: string;
	candidates: string[];
	trials: Record<string, string>; // trialId → terminal status
	/** Running cost from telemetry as trials settle (live runs). */
	costUsdSoFar: number;
	/** Coarse current phase for live UI feedback (e.g. "building", "grading"). */
	stage?: string;
	error?: string;
}

interface JobControl {
	entry: QueueEntry;
	abort: AbortController;
}

const jobs = new Map<string, JobControl>();

export function getQueue(): QueueEntry[] {
	return [...jobs.values()]
		.map((j) => j.entry)
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Fake build: writes the cold-start contract, no real agent — zero spend. */
const fakeExecutor = async (sandbox: {
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
	/** Injectable provider for tests (no spend). */
	makeProvider?: (
		provider: IsolationProviderId,
		runDir: string,
	) => ReturnType<typeof createProvider>;
	/** Injectable session executor for tests (no real agent, no spend). */
	executeScript?: SchedulerDeps["executeScript"];
}

/**
 * Launch a run through the orchestrator (eval-studio run-launch).
 *
 * - **dry run** (worktree + fake executor, zero spend) launches immediately.
 * - **real run** must clear four gates before any sandbox is provisioned:
 *   a non-dry request, launch authorization (`canLaunch`), an acknowledged
 *   budget confirmation (`req.confirmed`), and resolved budget caps the
 *   orchestrator enforces. Missing confirmation returns `needsConfirmation`
 *   (the resolved budget + matrix) rather than launching.
 *
 * Returns the runId immediately; the run executes as a tracked background job
 * (status + cost via getQueue(); cancel via cancelRun()).
 */
export async function launchRun(
	req: Partial<StudioRunRequest>,
	opts: { dryRun: boolean } & LaunchDeps = { dryRun: true },
): Promise<LaunchResult> {
	const v = validateRunRequest(req);
	if (v.errors.length) return { errors: v.errors };
	const r = req as StudioRunRequest;

	if (opts.dryRun) return launchDry(r);

	// ---- real run: authorization → confirmation → resolved caps ----
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
	const runDir = join("runs", runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });
	return { runId, runDir };
}

function loadDesignOrNull(name?: string): LoadedDesign | null {
	return name ? loadDesign(name) : null;
}

function launchDry(r: StudioRunRequest): { runId: string } {
	const { runId, runDir } = newRunId("-dry");
	const registry = loadRegistryForRun();
	const target = loadTarget(r.target);
	const design = loadDesignOrNull(r.design);
	registry.basePrompt = renderTargetPrompt(
		registry.basePrompt,
		target,
		design?.name,
	);
	const candidates = resolveCandidatesForRun(registry, r);
	const workerProfile = resolveProfile(r.workerModel, loadModels());
	const judgeProfile = resolveProfile("claude-sonnet-4-6", loadModels());
	const config = RunConfig.parse({
		candidates: r.candidates,
		harness: r.harness,
		model: r.workerModel,
		trialsPerCandidate: r.trials,
		provider: "worktree",
		weights: r.weights,
	});

	const abort = new AbortController();
	const entry: QueueEntry = {
		runId,
		kind: "dry",
		status: "running",
		startedAt: new Date().toISOString(),
		candidates: r.candidates,
		trials: {},
		costUsdSoFar: 0,
	};
	jobs.set(runId, { entry, abort });

	void (async () => {
		try {
			const startedAt = new Date().toISOString();
			const trials = await runMatrix(
				config,
				buildMatrix(candidates, config.trialsPerCandidate),
				{
					provider: new WorktreeProvider(join(runDir, "sandboxes")),
					registry,
					runDir,
					prdContent: target.prdContent,
					prdSha256: target.prdSha256,
					testPlanSha256: target.testPlanSha256,
					designContent: design?.content,
					harnessVersion: "studio-dry",
					workerModelFlag: workerProfile.modelId,
					workerModelRef: toModelRef(workerProfile),
					executeScript: fakeExecutor as never,
					abortSignal: abort.signal,
					onStage: (_id, stage) => {
						entry.stage = stage;
					},
				},
			);
			for (const t of trials)
				entry.trials[t.provenance.trialId] = t.provenance.status;
			entry.stage = undefined;
			const results = buildResults({
				runId,
				config,
				prdSha256: target.prdSha256,
				testPlanSha256: target.testPlanSha256,
				startedAt,
				endedAt: new Date().toISOString(),
				trials,
				workerModel: toModelRef(workerProfile),
				judgeModel: toModelRef(judgeProfile),
				crossVendorJudge: workerProfile.provider !== judgeProfile.provider,
				costSource: "tokens-only",
			});
			writeResults(runDir, results);
			writeScorecard(runDir, results);
			entry.status = abort.signal.aborted ? "cancelled" : "completed";
		} catch (e) {
			entry.status = "error";
			entry.error = String(e).slice(0, 300);
		}
	})();

	return { runId };
}

function launchLive(
	r: StudioRunRequest,
	policy: LaunchPolicy,
	principal: Principal,
	opts: LaunchDeps,
): { runId: string } {
	const { runId, runDir } = newRunId("");
	const registry = loadRegistryForRun();
	const target = loadTarget(r.target);
	const design = loadDesignOrNull(r.design);
	registry.basePrompt = renderTargetPrompt(
		registry.basePrompt,
		target,
		design?.name,
	);
	const candidates = resolveCandidatesForRun(registry, r);

	const models = loadModels();
	const workerProfile = resolveProfile(r.workerModel, models);
	const judgeProfile = resolveProfile("claude-sonnet-4-6", models);
	// Native Anthropic keeps the scheduler's OAuth/API-key fallback; third-party
	// profiles inject ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN (mirrors cmdRun).
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
		weights: r.weights,
	});

	const abort = new AbortController();
	const entry: QueueEntry = {
		runId,
		kind: "live",
		status: "running",
		startedAt: new Date().toISOString(),
		candidates: r.candidates,
		trials: {},
		costUsdSoFar: 0,
	};
	jobs.set(runId, { entry, abort });

	void (async () => {
		const settle = (outcome: RunOutcome) =>
			policy.onSettled?.(principal, runId, outcome).catch(() => {});
		try {
			await policy.onLaunched?.(principal, runId, r);
			const provider = (opts.makeProvider ?? defaultProvider)(
				config.provider,
				runDir,
			);
			if (provider.preflight)
				await provider.preflight({
					trialWallClockMs: config.budget.trialWallClockMs,
					concurrency: config.concurrency,
				});

			const startedAt = new Date().toISOString();
			const trials = await runMatrix(
				config,
				buildMatrix(candidates, config.trialsPerCandidate),
				{
					provider,
					registry,
					runDir,
					prdContent: target.prdContent,
					prdSha256: target.prdSha256,
					testPlanSha256: target.testPlanSha256,
					designContent: design?.content,
					harnessVersion: "studio-live",
					workerEnv,
					workerModelFlag,
					workerModelRef: toModelRef(workerProfile),
					executeScript: opts.executeScript,
					abortSignal: abort.signal,
					onStage: (_id, stage) => {
						entry.stage = stage;
					},
				},
			);
			for (const t of trials) {
				entry.trials[t.provenance.trialId] = t.provenance.status;
				entry.costUsdSoFar += t.telemetry?.totalCostUsd ?? 0;
			}

			if (r.grade && !abort.signal.aborted) {
				entry.stage = "grading";
				await gradeTrials(trials, {
					target,
					design,
					registry,
					judgeModel: judgeProfile.name,
					runDir,
				});
			}
			entry.stage = "finalizing";

			const results = buildResults({
				runId,
				config,
				prdSha256: target.prdSha256,
				testPlanSha256: target.testPlanSha256,
				startedAt,
				endedAt: new Date().toISOString(),
				trials,
				workerModel: toModelRef(workerProfile),
				judgeModel: toModelRef(judgeProfile),
				crossVendorJudge: workerProfile.provider !== judgeProfile.provider,
				costSource: "harness-reported",
			});
			writeResults(runDir, results);
			writeScorecard(runDir, results);

			const cancelled = abort.signal.aborted;
			entry.status = cancelled ? "cancelled" : "completed";
			const builtAny = trials.some((t) => t.provenance.status === "completed");
			await settle({
				status: entry.status === "cancelled" ? "cancelled" : "completed",
				costUsd: entry.costUsdSoFar,
				noBillableWork: !builtAny,
			});
		} catch (e) {
			entry.status = "error";
			entry.error = String(e).slice(0, 300);
			await settle({
				status: "error",
				costUsd: entry.costUsdSoFar,
				noBillableWork: true,
			});
		}
	})();

	return { runId };
}

function defaultProvider(provider: IsolationProviderId, runDir: string) {
	return createProvider(provider, {
		worktreeBaseDir: join(runDir, "sandboxes"),
	});
}

/**
 * Cancel a running job: no new trial starts and any in-flight sandbox is torn
 * down by the trial's own teardown, so a cancelled run leaks nothing.
 */
export function cancelRun(runId: string): { ok: boolean; error?: string } {
	const job = jobs.get(runId);
	if (!job) return { ok: false, error: "no such run" };
	if (job.entry.status !== "running")
		return { ok: false, error: `run is ${job.entry.status}` };
	job.abort.abort();
	return { ok: true };
}

// ---- small shared helpers ----

function loadRegistryForRun() {
	return loadRegistry("config/registry.yaml");
}
function resolveCandidatesForRun(
	registry: ReturnType<typeof loadRegistry>,
	r: StudioRunRequest,
) {
	return resolveCandidates(registry, r.candidates, r.harness as HarnessId);
}
