import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

export interface SchedulerDeps {
	provider: SandboxProvider;
	registry: Registry;
	runDir: string;
	prdContent: string;
	prdSha256: string;
	testPlanSha256: string | null;
	harnessVersion: string;
	/** Injectable for tests. */
	executeScript?: typeof executeSessionScript;
	archive?: typeof archiveTrial;
	now?: () => Date;
}

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
	return /provision|sandbox|network|econnre|etimedout|enotfound|rate.?limit|5\d\d|snapshot/.test(
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
		model: config.model,
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
	const provenance = baseProvenance(plan, config, deps, "running");
	const trialDir = join(deps.runDir, "trials", plan.trialId);
	mkdirSync(trialDir, { recursive: true });

	for (let attempt = 0; ; attempt++) {
		let sandbox: Sandbox | null = null;
		try {
			const setupStart = Date.now();
			sandbox = await deps.provider.provision(plan.trialId);
			await sandbox.writeFile(
				join(sandbox.workspacePath, "SPEC.md"),
				deps.prdContent,
			);
			const setup = plan.candidate.harnesses[config.harness];
			if (!setup)
				throw new Error(`no ${config.harness} setup for ${plan.candidate.id}`);
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
			// Worker auth: the only secret that enters the sandbox. Subscription
			// OAuth cannot follow into a sandbox; an API key (or setup-token) is
			// required for headless Claude Code.
			const workerAuth: Record<string, string> = {};
			if (process.env.ANTHROPIC_API_KEY) workerAuth.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
			if (process.env.CLAUDE_CODE_OAUTH_TOKEN)
				workerAuth.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
			const result = await exec(sandbox, {
				model: config.model,
				steps: script,
				continuation: setup.continuation,
				wallClockBudgetMs: config.budget.trialWallClockMs,
				costBudgetUsd: config.budget.trialCostUsd,
				env: workerAuth,
			});

			const telemetry = aggregateTelemetry(result.records, setupDurationMs);
			ledger.add(telemetry.totalCostUsd);
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
			if (isInfraFailure(err) && attempt < config.infraRetryLimit) {
				provenance.notes.push(
					`infra retry ${attempt + 1}: ${String(err).slice(0, 200)}`,
				);
				continue;
			}
			provenance.status = "infra-failed";
			provenance.endedAt = new Date().toISOString();
			provenance.notes.push(String(err).slice(0, 500));
			persistProvenance(deps.runDir, provenance);
			return { provenance, telemetry: null, grades: null };
		} finally {
			await sandbox?.destroy().catch(() => {});
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
