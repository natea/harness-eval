import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SessionScriptResult } from "../driver/session";
import { loadModels, resolveProfile, toModelRef } from "../models";
import { buildMatrix, runMatrix } from "../orchestrator/scheduler";
import { WorktreeProvider } from "../providers/worktree";
import { loadRegistry, resolveCandidates } from "../registry";
import { writeScorecard } from "../report/markdown";
import { buildResults, writeResults } from "../report/results";
import { loadTarget, renderTargetPrompt } from "../targets";
import { type HarnessId, RunConfig } from "../types";
import { type StudioRunRequest, validateRunRequest } from "./options";

export interface QueueEntry {
	runId: string;
	dryRun: boolean;
	status: "running" | "completed" | "error";
	startedAt: string;
	candidates: string[];
	trials: Record<string, string>; // trialId → terminal status
	error?: string;
}

const queue = new Map<string, QueueEntry>();

export function getQueue(): QueueEntry[] {
	return [...queue.values()].sort((a, b) =>
		b.startedAt.localeCompare(a.startedAt),
	);
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

/**
 * Launch a run through the orchestrator (eval-studio run-launch). Validated with
 * the same rules as the CLI. Only the **dry-run** path (worktree + fake executor,
 * no spend) launches from the studio today; real runs return the copy-the-command
 * guidance, since real builds bill the subscription and must be operator-driven.
 * Returns the runId immediately and runs in the background; status via getQueue().
 */
export function launchRun(
	req: Partial<StudioRunRequest>,
	opts: { dryRun: boolean },
): { runId?: string; errors?: string[] } {
	const v = validateRunRequest(req);
	if (v.errors.length) return { errors: v.errors };
	if (!opts.dryRun)
		return {
			errors: [
				"live launch from the studio is disabled (real builds bill your subscription) — copy the CLI command and run it from your shell",
			],
		};
	const r = req as StudioRunRequest;

	const registry = loadRegistry("config/registry.yaml");
	const target = loadTarget(r.target);
	registry.basePrompt = renderTargetPrompt(registry.basePrompt, target);
	const candidates = resolveCandidates(
		registry,
		r.candidates,
		r.harness as HarnessId,
	);
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

	const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}-dry`;
	const runDir = join("runs", runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });

	const entry: QueueEntry = {
		runId,
		dryRun: true,
		status: "running",
		startedAt: new Date().toISOString(),
		candidates: r.candidates,
		trials: {},
	};
	queue.set(runId, entry);

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
					harnessVersion: "studio-dry",
					workerModelFlag: workerProfile.modelId,
					workerModelRef: toModelRef(workerProfile),
					executeScript: fakeExecutor as never,
				},
			);
			for (const t of trials)
				entry.trials[t.provenance.trialId] = t.provenance.status;
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
			entry.status = "completed";
		} catch (e) {
			entry.status = "error";
			entry.error = String(e).slice(0, 300);
		}
	})();

	return { runId };
}
