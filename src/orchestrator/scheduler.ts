import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getHarnessDriver, type HarnessDriver } from "../driver";
import { archiveTrial } from "../driver/archive";
import { executeSessionScript } from "../driver/session";
import { aggregateTelemetry } from "../driver/telemetry";
import type { Sandbox, SandboxProvider } from "../providers/types";
import { renderSessionScript } from "../registry";
import type {
	CandidateEntry,
	Registry,
	RunConfig,
	TrialProvenance,
	TrialResult,
	TrialStatus,
} from "../types";

export interface TrialPlan {
	trialId: string;
	candidate: CandidateEntry;
	trialIndex: number;
}

/** Hard cap on per-trial teardown. Larger than the provider's internal ladder
 *  budget (TEARDOWN_STEP_MS × steps + reap), so it only fires if teardown hangs
 *  somewhere unexpected. */
const TEARDOWN_CAP_MS = 90_000;

export interface SchedulerDeps {
	provider: SandboxProvider;
	registry: Registry;
	runDir: string;
	prdContent: string;
	prdSha256: string;
	testPlanSha256: string | null;
	/** Frozen DESIGN.md placed in each workspace when a design is selected
	 *  (design-adherence). Identical bytes for every candidate. */
	designContent?: string;
	harnessVersion: string;
	/**
	 * Resolved worker-model env (model-registry): the secret/base-url/auth-token
	 * bundle injected into the session. When omitted, falls back to the native
	 * Anthropic worker-auth rule below (backward compatible).
	 */
	workerEnv?: Record<string, string>;
	/** Resolved worker `--model` flag; defaults to config.model. */
	workerModelFlag?: string;
	/** Resolved worker profile identity for provenance (never the key). */
	workerModelRef?: import("../types").ModelRef;
	/** Injectable for tests. */
	driver?: HarnessDriver;
	executeScript?: typeof executeSessionScript;
	archive?: (
		sandbox: Sandbox,
		trialDir: string,
		transcripts: string[],
	) => Promise<unknown>;
	now?: () => Date;
	/**
	 * Cooperative cancel (studio live runs): when aborted, no new trial starts —
	 * remaining plans terminate as skipped/cancelled. In-flight trials finish
	 * their current sandbox lifecycle, whose `finally` tears the sandbox down, so
	 * a cancelled run leaks no cloud resources.
	 */
	abortSignal?: AbortSignal;
	/**
	 * Coarse per-trial progress for live UIs (studio): called as a trial moves
	 * through provisioning → installing → building → archiving. Best-effort,
	 * non-fatal; the host can't see inside the agent session.
	 */
	onStage?: (trialId: string, stage: TrialStage) => void;
}

export type TrialStage =
	| "provisioning"
	| "installing"
	| "building"
	| "archiving";

/** Build the full trial matrix: candidates x trialsPerCandidate. */
export function buildMatrix(
	candidates: CandidateEntry[],
	trials: number,
): TrialPlan[] {
	return candidates
		.flatMap((candidate, ci) =>
			Array.from({ length: trials }, (_, t) => ({
				trialId: `${candidate.id}-t${t + 1}`,
				candidate,
				trialIndex: t,
				_order: t * candidates.length + ci, // interleave candidates across time
			})),
		)
		.sort(
			(a, b) =>
				(a as { _order: number })._order - (b as { _order: number })._order,
		)
		.map(({ _order, ...plan }) => plan as TrialPlan);
}

/** Classify a thrown error: infra failures are retried, candidate failures are not. */
export function isInfraFailure(err: unknown): boolean {
	const msg = String(err).toLowerCase();
	return /provision|sandbox|network|econnre|etimedout|enotfound|rate.?limit|5\d\d|snapshot|memory limit|quota|daytona(validation|connection|timeout)error|request timeout/.test(
		msg,
	);
}

export class RunLedger {
	private spentUsd = 0;
	constructor(private ceilingUsd: number) {}
	add(usd: number) {
		this.spentUsd += usd;
	}
	exceeded(): boolean {
		return this.spentUsd >= this.ceilingUsd;
	}
	spent(): number {
		return this.spentUsd;
	}
}

/**
 * Execute the run matrix with bounded concurrency, infra-retry
 * classification, run-level budget ceiling, and provenance at every
 * terminal state (eval-orchestration spec).
 */
export async function runMatrix(
	config: RunConfig,
	plans: TrialPlan[],
	deps: SchedulerDeps,
): Promise<TrialResult[]> {
	const ledger = new RunLedger(config.budget.runCostUsd);
	const results: TrialResult[] = [];
	const queue = [...plans];
	const workers = Array.from(
		{ length: Math.min(config.concurrency, queue.length) },
		async () => {
			for (;;) {
				const plan = queue.shift();
				if (!plan) return;
				if (deps.abortSignal?.aborted) {
					results.push(
						skippedResult(plan, config, deps, "run cancelled by operator"),
					);
					continue;
				}
				if (ledger.exceeded()) {
					results.push(
						skippedResult(plan, config, deps, "run cost ceiling reached"),
					);
					continue;
				}
				results.push(await runTrial(plan, config, deps, ledger));
			}
		},
	);
	await Promise.all(workers);
	return results;
}

function baseProvenance(
	plan: TrialPlan,
	config: RunConfig,
	deps: SchedulerDeps,
	status: TrialStatus,
): TrialProvenance {
	const now = (deps.now ?? (() => new Date()))();
	return {
		runId: deps.runDir.split("/").at(-1) ?? deps.runDir,
		trialId: plan.trialId,
		candidate: plan.candidate.id,
		candidateVersion: plan.candidate.pinnedVersion,
		harness: config.harness,
		harnessVersion: deps.harnessVersion,
		model: deps.workerModelRef?.name ?? config.model,
		workerModel: deps.workerModelRef,
		provider: deps.provider.id,
		snapshotId: deps.provider.snapshotId,
		prdSha256: deps.prdSha256,
		testPlanSha256: deps.testPlanSha256,
		sessionScript: renderSessionScript(
			deps.registry,
			plan.candidate,
			config.harness,
		),
		startedAt: now.toISOString(),
		endedAt: null,
		status,
		cappedBy: null,
		notes: [],
	};
}

function skippedResult(
	plan: TrialPlan,
	config: RunConfig,
	deps: SchedulerDeps,
	reason: string,
): TrialResult {
	const provenance = baseProvenance(plan, config, deps, "skipped:budget");
	provenance.endedAt = provenance.startedAt;
	provenance.notes.push(reason);
	persistProvenance(deps.runDir, provenance);
	return { provenance, telemetry: null, grades: null };
}

export async function runTrial(
	plan: TrialPlan,
	config: RunConfig,
	deps: SchedulerDeps,
	ledger: RunLedger,
): Promise<TrialResult> {
	const exec = deps.executeScript ?? executeSessionScript;
	const archive = deps.archive ?? archiveTrial;
	const driver = deps.driver ?? getHarnessDriver(config.harness);
	const provenance = baseProvenance(plan, config, deps, "running");
	const trialDir = join(deps.runDir, "trials", plan.trialId);
	mkdirSync(trialDir, { recursive: true });

	for (let attempt = 0; ; attempt++) {
		let sandbox: Sandbox | null = null;
		let onAbort: (() => void) | undefined;
		try {
			const setupStart = Date.now();
			deps.onStage?.(plan.trialId, "provisioning");
			sandbox = await deps.provider.provision(plan.trialId);
			// Cancel teardown: destroying the in-flight sandbox makes the pending
			// exec/install throw immediately, so a cancel interrupts a stuck trial
			// instead of waiting for the wall-clock budget (studio live-run cancel).
			const s = sandbox;
			onAbort = () => {
				void s.destroy().catch(() => {});
			};
			deps.abortSignal?.addEventListener("abort", onAbort, { once: true });
			await sandbox.writeFile(
				join(sandbox.workspacePath, "SPEC.md"),
				deps.prdContent,
			);
			if (deps.designContent)
				await sandbox.writeFile(
					join(sandbox.workspacePath, "DESIGN.md"),
					deps.designContent,
				);
			const setup = plan.candidate.harnesses[config.harness];
			if (!setup)
				throw new Error(`no ${config.harness} setup for ${plan.candidate.id}`);
			deps.onStage?.(plan.trialId, "installing");
			for (const cmd of setup.install) {
				const res = await sandbox.exec(cmd, { timeoutMs: 10 * 60 * 1000 });
				if (res.exitCode !== 0) {
					throw new Error(
						`install failed (provisioning): ${cmd}\n${res.stdout}\n${res.stderr}`,
					);
				}
			}
			const setupDurationMs = Date.now() - setupStart;

			const script = renderSessionScript(
				deps.registry,
				plan.candidate,
				config.harness,
			);
			// Worker auth: the only secret that enters the sandbox. A resolved
			// model-registry profile (deps.workerEnv) takes precedence; otherwise
			// fall back to the native rule — prefer the subscription OAuth token,
			// pass the API key ONLY when no OAuth token exists (Claude Code
			// prioritizes ANTHROPIC_API_KEY when both are set, silently billing
			// the API account).
			let workerAuth: Record<string, string>;
			if (deps.workerEnv) {
				workerAuth = deps.workerEnv;
			} else {
				workerAuth = {};
				if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
					workerAuth.CLAUDE_CODE_OAUTH_TOKEN =
						process.env.CLAUDE_CODE_OAUTH_TOKEN;
					workerAuth.ANTHROPIC_API_KEY = "";
				} else if (process.env.ANTHROPIC_API_KEY) {
					workerAuth.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
				}
			}
			deps.onStage?.(plan.trialId, "building");
			const result = await exec(sandbox, {
				driver,
				model: deps.workerModelFlag ?? config.model,
				steps: script,
				continuation: setup.continuation,
				wallClockBudgetMs: config.budget.trialWallClockMs,
				costBudgetUsd: config.budget.trialCostUsd,
				env: workerAuth,
			});

			const telemetry = aggregateTelemetry(result.records, setupDurationMs);
			ledger.add(telemetry.totalCostUsd);
			deps.onStage?.(plan.trialId, "archiving");
			await archive(sandbox, trialDir, result.transcripts);

			provenance.status = result.status === "capped" ? "capped" : "completed";
			provenance.cappedBy = result.cappedBy;
			provenance.notes.push(...result.notes);
			if (result.status === "error") {
				// Candidate failure: never retried; graded as-is (spec: failure handling).
				provenance.notes.push(
					"session script ended in error; grading artifact as-is",
				);
			}
			provenance.endedAt = new Date().toISOString();
			persistProvenance(deps.runDir, provenance);
			return { provenance, telemetry, grades: null };
		} catch (err) {
			// Cancelled mid-trial: the error is the torn-down sandbox, not real
			// infra failure — terminate now, never retry.
			if (deps.abortSignal?.aborted) {
				provenance.status = "infra-failed";
				provenance.endedAt = new Date().toISOString();
				provenance.notes.push(
					"cancelled by operator (in-flight sandbox torn down)",
				);
				persistProvenance(deps.runDir, provenance);
				return { provenance, telemetry: null, grades: null };
			}
			if (isInfraFailure(err) && attempt < config.infraRetryLimit) {
				provenance.notes.push(
					`infra retry ${attempt + 1}: ${String(err).slice(0, 200)}`,
				);
				// Provider-side resource accounting (e.g. Daytona memory quota)
				// can lag sandbox deletion by tens of seconds — back off.
				await new Promise((r) => setTimeout(r, 60_000 * (attempt + 1)));
				continue;
			}
			provenance.status = "infra-failed";
			provenance.endedAt = new Date().toISOString();
			provenance.notes.push(String(err).slice(0, 500));
			persistProvenance(deps.runDir, provenance);
			return { provenance, telemetry: null, grades: null };
		} finally {
			if (onAbort) deps.abortSignal?.removeEventListener("abort", onAbort);
			// Time-box teardown: destroy() is itself bounded + escalating, but cap
			// the whole thing so an unexpected hang (e.g. a slow OS-level reap) can
			// never stall the run. A sandbox that outlives the cap is logged as a
			// leak rather than silently awaited forever (harden-container-teardown).
			if (sandbox) {
				const s = sandbox;
				await Promise.race([
					s.destroy().catch(() => {}),
					new Promise<void>((resolve) =>
						setTimeout(() => {
							console.warn(
								`[scheduler] teardown of ${s.id} exceeded ${TEARDOWN_CAP_MS / 1000}s — moving on; run \`bun run src/cli.ts cleanup\` to reap any leaked VM`,
							);
							resolve();
						}, TEARDOWN_CAP_MS),
					),
				]);
			}
		}
	}
}

export function persistProvenance(
	runDir: string,
	provenance: TrialProvenance,
): void {
	const dir = join(runDir, "trials", provenance.trialId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "provenance.json"),
		JSON.stringify(provenance, null, 2),
	);
}
