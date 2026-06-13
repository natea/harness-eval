#!/usr/bin/env bun
/**
 * harness-eval CLI.
 *
 *   bun run src/cli.ts validate
 *       Validate registry + test plan + PRD hash + fixture manifest.
 *
 *   bun run src/cli.ts run --candidates gsd,superpowers --trials 1 \
 *       [--provider worktree|daytona] [--snapshot harness-eval-base:v2] [--grade]
 *       Execute the matrix. Builds happen with real Claude Code sessions —
 *       REAL SPEND. --grade additionally runs evaluator+judge (API spend).
 *
 *   bun run src/cli.ts report <run-dir> [--weights a,q,s,t]
 *       (Re)generate results.json + scorecard.md from stored trials.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { runEvaluator } from "./grading/evaluator";
import { loadManifest } from "./grading/integration";
import { judgeQuality } from "./grading/judge";
import { scrubWorkspace } from "./grading/scrub";
import { loadTestPlan } from "./grading/testplan";
import {
	defaultCostSource,
	judgeWorkerRelation,
	loadModels,
	resolveClaudeCodeEnv,
	resolveProfile,
	toModelRef,
} from "./models";
import { buildMatrix, runMatrix } from "./orchestrator/scheduler";
import { DaytonaProvider } from "./providers/daytona";
import { WorktreeProvider } from "./providers/worktree";
import { loadRegistry, resolveCandidates } from "./registry";
import { writeScorecard } from "./report/markdown";
import { buildResults, writeResults } from "./report/results";
import {
	loadTarget,
	renderTargetPrompt,
	startFixtures,
	stopFixtures,
} from "./targets";
import { RunConfig, type TrialResult, Weights } from "./types";

const REGISTRY_PATH = "config/registry.yaml";
const MANIFEST_PATH = "config/fixtures-manifest.yaml";
const DEFAULTS_PATH = "config/run.defaults.yaml";

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

async function cmdValidate(): Promise<void> {
	const registry = loadRegistry(REGISTRY_PATH);
	console.log(
		`registry OK: ${registry.candidates.map((c) => `${c.id}@${c.pinnedVersion}`).join(", ")}`,
	);
	const target = loadTarget(arg("target") ?? "symphony-daemon");
	console.log(
		`target OK: ${target.manifest.name}@${target.manifest.version} — ${target.plan.steps.length} steps, plan ${target.testPlanSha256.slice(0, 12)}…, PRD ${target.prdSha256.slice(0, 12)}…`,
	);
	const { manifest, sha256: msha } = loadManifest(MANIFEST_PATH);
	console.log(
		`fixture manifest OK: ${manifest.fixtures.length} fixtures, sha ${msha.slice(0, 12)}…`,
	);
}

async function cmdRun(): Promise<void> {
	const registry = loadRegistry(REGISTRY_PATH);
	const defaults = existsSync(DEFAULTS_PATH)
		? (parse(readFileSync(DEFAULTS_PATH, "utf8")) as Record<string, unknown>)
		: {};
	const config = RunConfig.parse({
		...defaults,
		candidates: (
			arg("candidates") ?? registry.candidates.map((c) => c.id).join(",")
		).split(","),
		trialsPerCandidate: Number(
			arg("trials") ?? (defaults.trialsPerCandidate as number | undefined) ?? 3,
		),
		provider:
			arg("provider") ?? (defaults.provider as string | undefined) ?? "daytona",
		concurrency: Number(
			arg("concurrency") ?? (defaults.concurrency as number | undefined) ?? 2,
		),
	});
	const candidates = resolveCandidates(
		registry,
		config.candidates,
		config.harness,
	);

	// Worker model resolution (model-registry). `--worker-model` (or config.model)
	// names a profile; bare claude-* ids resolve to implicit native profiles.
	// Native Anthropic keeps the scheduler's OAuth/API-key fallback; third-party
	// profiles (e.g. z.ai GLM) inject ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN.
	const models = loadModels();
	const workerProfile = resolveProfile(arg("worker-model") ?? config.model, models);
	let workerEnv: Record<string, string> | undefined;
	let workerModelFlag = workerProfile.modelId;
	if (workerProfile.provider !== "anthropic") {
		const resolved = resolveClaudeCodeEnv(workerProfile);
		workerEnv = resolved.env;
		workerModelFlag = resolved.modelFlag; // mapped slot (e.g. "opus") for z.ai
		console.log(
			`worker model: ${workerProfile.name} (${workerProfile.provider}) → ${workerProfile.modelId} via ${workerProfile.baseUrl}`,
		);
	} else if (workerProfile.name !== "claude-opus-4-6") {
		console.log(`worker model: ${workerProfile.name} (anthropic)`);
	}

	// Judge-validity guardrail (model-registry): judge must differ from worker;
	// cross-vendor judging is allowed but flagged as a bias caveat.
	const judgeProfile = resolveProfile(config.judgeModel, models);
	const { crossVendor } = judgeWorkerRelation(workerProfile, judgeProfile);
	if (crossVendor) {
		console.log(
			`⚠ cross-vendor judge: ${judgeProfile.provider} judge (${judgeProfile.name}) grading ${workerProfile.provider} worker (${workerProfile.name}) — recorded as a judge-bias caveat`,
		);
	}
	const workerModelRef = toModelRef(workerProfile);
	const judgeModelRef = toModelRef(judgeProfile);
	const costSource = defaultCostSource(workerProfile);

	const target = loadTarget(arg("target") ?? "symphony-daemon");
	registry.basePrompt = renderTargetPrompt(registry.basePrompt, target);
	const sha = target.prdSha256;
	const plan = target.plan;
	const planSha = target.testPlanSha256;

	const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	const runDir = join("runs", runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });

	const provider =
		config.provider === "daytona"
			? new DaytonaProvider(arg("snapshot") ?? "harness-eval-base:v2")
			: new WorktreeProvider(join(runDir, "sandboxes"));

	console.log(
		`run ${runId}: ${candidates.length} candidate(s) × ${config.trialsPerCandidate} trial(s) on ${provider.id}`,
	);
	console.log(
		`budget: $${config.budget.trialCostUsd}/trial, $${config.budget.runCostUsd}/run, ${config.budget.trialWallClockMs / 60000}m wall-clock/trial`,
	);

	const startedAt = new Date().toISOString();
	const trials = await runMatrix(
		config,
		buildMatrix(candidates, config.trialsPerCandidate),
		{
			provider,
			registry,
			runDir,
			prdContent: target.prdContent,
			prdSha256: sha,
			testPlanSha256: planSha,
			harnessVersion: arg("harness-version") ?? "2.1.170",
			workerEnv,
			workerModelFlag,
			workerModelRef,
		},
	);

	if (flag("grade")) {
		// Each trial gets fresh fixture processes on their own ports.
		let mockPort = 4280;
		for (const trial of trials) {
			const trialDir = join(runDir, "trials", trial.provenance.trialId);
			const workspace = join(trialDir, "workspace");
			if (!existsSync(workspace)) continue;
			console.log(`grading ${trial.provenance.trialId}…`);
			mockPort++;
			const fixtures = startFixtures(target, mockPort);
			await new Promise((r) => setTimeout(r, 500));
			writeFileSync(join(workspace, "SPEC-REFERENCE.md"), target.prdContent);
			let adherence: Awaited<ReturnType<typeof runEvaluator>>;
			let quality: Awaited<ReturnType<typeof judgeQuality>>;
			try {
				adherence = await runEvaluator(plan, {
					model: config.judgeModel,
					workspaceDir: workspace,
					mockLinearUrl:
						fixtures.find((f) => f.name === "mock-linear")?.value ??
						`http://localhost:${mockPort}`,
					stubAppServerPath:
						fixtures.find((f) => f.name === "stub-app-server")?.value ?? "",
				});
				const blindDir = join(trialDir, "workspace-blind");
				scrubWorkspace(workspace, blindDir, registry.candidates);
				quality = await judgeQuality({
					model: config.judgeModel,
					blindWorkspaceDir: blindDir,
				});
			} finally {
				stopFixtures(fixtures);
			}
			trial.grades = {
				trialId: trial.provenance.trialId,
				adherence,
				quality,
				integration: null,
			};
			writeFileSync(
				join(trialDir, "grades.json"),
				JSON.stringify(trial.grades, null, 2),
			);
		}
	}

	const results = buildResults({
		runId,
		config,
		prdSha256: sha,
		testPlanSha256: planSha,
		startedAt,
		endedAt: new Date().toISOString(),
		trials,
		workerModel: workerModelRef,
		judgeModel: judgeModelRef,
		crossVendorJudge: crossVendor,
		costSource,
	});
	console.log(`results: ${writeResults(runDir, results)}`);
	console.log(`scorecard: ${writeScorecard(runDir, results)}`);
}

async function cmdModel(): Promise<void> {
	const sub = process.argv[3];
	const ref = process.argv[4];
	if (sub !== "probe" || !ref) {
		throw new Error("usage: model probe <profile>   (1-token connectivity check)");
	}
	const profile = resolveProfile(ref, loadModels());
	if (profile.transport !== "claude-code") {
		throw new Error(
			`probe supports claude-code transport only (profile '${profile.name}' is ${profile.transport})`,
		);
	}
	const { env, modelFlag } = resolveClaudeCodeEnv(profile);
	console.log(
		`probing ${profile.name} (${profile.provider}, model ${modelFlag})${profile.baseUrl ? ` via ${profile.baseUrl}` : ""}…`,
	);
	const proc = Bun.spawn(
		[
			"claude",
			"-p",
			"--model",
			modelFlag,
			"--output-format",
			"json",
			"--dangerously-skip-permissions",
		],
		{
			stdin: new TextEncoder().encode("Reply with exactly: OK"),
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, ...env },
		},
	);
	const timer = setTimeout(() => proc.kill(), 150000);
	const out = await new Response(proc.stdout).text();
	const err = await new Response(proc.stderr).text();
	clearTimeout(timer);
	const code = await proc.exited;
	const line = out
		.split("\n")
		.reverse()
		.find((l) => l.trim().startsWith("{") && l.includes('"type":"result"'));
	if (code === 0 && line) {
		const obj = JSON.parse(line) as Record<string, unknown>;
		const reply = String(obj.result ?? "").trim();
		console.log(
			`✓ probe OK — reply ${JSON.stringify(reply.slice(0, 40))}, cost $${obj.total_cost_usd ?? "?"}, ${obj.num_turns ?? "?"} turn(s)`,
		);
	} else {
		console.error(`✗ probe FAILED (exit ${code})`);
		if (err.trim()) console.error(err.trim().split("\n").slice(-5).join("\n"));
		process.exit(1);
	}
}

async function cmdReport(): Promise<void> {
	const runDir = process.argv[3];
	if (!runDir || !existsSync(runDir))
		throw new Error("usage: report <run-dir> [--weights a,q,s,t]");
	const prior = JSON.parse(readFileSync(join(runDir, "results.json"), "utf8"));
	const trials: TrialResult[] = prior.trials;
	// Reattach grades persisted after the original results were written.
	for (const t of trials) {
		const gradesPath = join(
			runDir,
			"trials",
			t.provenance.trialId,
			"grades.json",
		);
		if (t.grades === null && existsSync(gradesPath)) {
			t.grades = JSON.parse(readFileSync(gradesPath, "utf8"));
		}
	}
	let weights: Weights | undefined;
	const w = arg("weights");
	if (w) {
		const [a, q, s, t] = w.split(",").map(Number);
		weights = Weights.parse({
			prdAdherence: a,
			codeQuality: q,
			speed: s,
			tokenSpend: t,
		});
	}
	const results = buildResults({
		runId: prior.runId,
		config: RunConfig.parse(prior.config),
		weights,
		prdSha256: prior.prdSha256,
		testPlanSha256: prior.testPlanSha256,
		startedAt: prior.startedAt,
		endedAt: prior.endedAt,
		trials,
		// Preserve the resolved model metadata recorded at run time (re-report
		// must not drop the worker/judge profiles or caveats).
		workerModel: prior.workerModel,
		judgeModel: prior.judgeModel,
		crossVendorJudge: prior.crossVendorJudge,
		costSource: prior.costSource,
	});
	console.log(`results: ${writeResults(runDir, results)}`);
	console.log(`scorecard: ${writeScorecard(runDir, results)}`);
}

const cmd = process.argv[2];
const commands: Record<string, () => Promise<void>> = {
	validate: cmdValidate,
	model: cmdModel,
	run: cmdRun,
	report: cmdReport,
};
const handler = commands[cmd ?? ""];
if (!handler) {
	console.error(
		"usage: cli.ts <validate|model|run|report> [options]   (see file header)",
	);
	process.exit(2);
}
await handler();
