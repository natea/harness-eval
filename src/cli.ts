#!/usr/bin/env bun
/**
 * harness-eval CLI.
 *
 *   bun run src/cli.ts validate [--target <name>]
 *       Validate registry + test plan + PRD hash + fixture manifest.
 *
 *   bun run src/cli.ts init --target <name> --spec <file>
 *       Scaffold a new target (PRD.md + skeleton testplan.yaml + target.yaml)
 *       from a spec document. Fill the TODOs + human review before validate.
 *
 *   bun run src/cli.ts run --candidates gsd,superpowers --trials 1 \
 *       [--harness claude-code] [--provider worktree|daytona] [--snapshot harness-eval-base:v4] \
 *       [--target <name>] [--design <name>] [--trial-minutes M] [--grade]
 *       Execute the matrix. Builds happen with real Claude Code sessions —
 *       REAL SPEND. --design places a frozen DESIGN.md in each workspace and
 *       (with --grade, on UI targets) scores design adherence. --grade
 *       additionally runs evaluator+judge (API spend).
 *
 *   bun run src/cli.ts report <run-dir> [--weights a,q,s,t]
 *       (Re)generate results.json + scorecard.md from stored trials.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
	CATALOG_PATH,
	checkCatalog,
	generateCatalog,
	loadCatalog,
} from "./catalog";
import { type LoadedDesign, loadDesign } from "./designs";
import { loadManifest } from "./grading/integration";
import { loadHarnesses, resolveHarness } from "./harnesses";
import {
	costSourceForHarness,
	judgeWorkerRelation,
	loadModels,
	resolveClaudeCodeEnv,
	resolveProfile,
	resolveWorkerEnv,
	toModelRef,
} from "./models";
import { gradeTrials } from "./orchestrator/grade";
import { buildMatrix, runMatrix } from "./orchestrator/scheduler";
import {
	createProvider,
	preflightProbeForHarness,
	resolveProviderSnapshot,
} from "./providers/factory";
import { loadRegistry, resolveCandidates } from "./registry";
import { writeScorecard } from "./report/markdown";
import { buildResults, writeResults } from "./report/results";
import { loadTarget, renderTargetPrompt, scaffoldTarget } from "./targets";
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

	// Catalog: list every target with its selection metadata, then enforce that
	// the generated docs/TARGETS.md is not stale (eval-targets spec).
	const entries = loadCatalog();
	console.log(`\ntarget catalog (${entries.length}):`);
	for (const e of entries) {
		console.log(`  ${e.name} — ${e.summary} [${e.shape}, ui:${e.expectedUI}]`);
	}
	const { stale } = checkCatalog();
	if (stale) {
		throw new Error(
			`${CATALOG_PATH} is stale — run \`bun run src/cli.ts catalog\` to regenerate it`,
		);
	}
	console.log(`catalog OK: ${CATALOG_PATH} up to date`);
}

async function cmdCatalog(): Promise<void> {
	const { writeFileSync } = await import("node:fs");
	const md = generateCatalog();
	if (flag("check")) {
		const { stale } = checkCatalog();
		if (stale) {
			console.error(
				`✗ ${CATALOG_PATH} is stale — run \`bun run src/cli.ts catalog\` to regenerate`,
			);
			process.exit(1);
		}
		console.log(`✓ ${CATALOG_PATH} up to date`);
		return;
	}
	writeFileSync(CATALOG_PATH, md);
	console.log(`wrote ${CATALOG_PATH} (${md.split("\n").length} lines)`);
}

async function cmdRun(): Promise<void> {
	const harnesses = loadHarnesses();
	const registry = loadRegistry(REGISTRY_PATH, harnesses);
	const defaults = existsSync(DEFAULTS_PATH)
		? (parse(readFileSync(DEFAULTS_PATH, "utf8")) as Record<string, unknown>)
		: {};
	// --trial-minutes overrides the per-trial wall-clock cap (the default comes
	// from run.defaults.yaml's budget block). Applies to every provider, not
	// just the cloud preflight.
	const trialMinutes = arg("trial-minutes");
	const baseBudget =
		(defaults.budget as Record<string, unknown> | undefined) ?? {};
	if (trialMinutes !== undefined && !(Number(trialMinutes) > 0)) {
		throw new Error(
			`--trial-minutes must be a positive number, got ${trialMinutes}`,
		);
	}
	const budget =
		trialMinutes !== undefined
			? { ...baseBudget, trialWallClockMs: Number(trialMinutes) * 60000 }
			: baseBudget;
	const config = RunConfig.parse({
		...defaults,
		candidates: (
			arg("candidates") ?? registry.candidates.map((c) => c.id).join(",")
		).split(","),
		harness: arg("harness") ?? (defaults.harness as string | undefined),
		trialsPerCandidate: Number(
			arg("trials") ?? (defaults.trialsPerCandidate as number | undefined) ?? 3,
		),
		provider:
			arg("provider") ?? (defaults.provider as string | undefined) ?? "daytona",
		concurrency: Number(
			arg("concurrency") ?? (defaults.concurrency as number | undefined) ?? 2,
		),
		...(arg("judge-model") ? { judgeModel: arg("judge-model") } : {}),
		budget,
	});
	const candidates = resolveCandidates(
		registry,
		config.candidates,
		config.harness,
		harnesses,
	);
	const harness = resolveHarness(config.harness, harnesses);

	// Worker model resolution (model-registry). `--worker-model` (or config.model)
	// names a profile; bare claude-* ids resolve to implicit native profiles.
	// Native Anthropic keeps the scheduler's OAuth/API-key fallback; third-party
	// profiles (e.g. z.ai GLM) inject ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN.
	const models = loadModels();
	const workerProfile = resolveProfile(
		arg("worker-model") ?? config.model,
		models,
	);
	// Single shared resolver (codex/oauth/api-key/third-party/native) — identical
	// to the studio run path so they can't drift.
	const rw = resolveWorkerEnv(workerProfile);
	const workerEnv = rw.env;
	const workerModelFlag = rw.modelFlag;
	if (rw.note) {
		console.log(
			`worker model: ${workerProfile.name} (${workerProfile.provider}) → ${workerProfile.modelId} via ${workerProfile.transport === "codex" ? `codex (${rw.note})` : workerProfile.baseUrl}`,
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
	// Token-only harnesses (Codex, ZeroClaw) report no billed USD even on the
	// Anthropic route, so cost is profile-priced/tokens-only — never the harness's
	// (absent) dollar figure.
	const costSource = costSourceForHarness(workerProfile, harness.reportsCost);

	const target = loadTarget(arg("target") ?? "symphony-daemon");

	// Optional design selection (design-adherence): load + hash the frozen
	// DESIGN.md, warn if the target has no UI (the contract would be a no-op).
	let design: LoadedDesign | null = null;
	const designName = arg("design");
	if (designName) {
		design = loadDesign(designName);
		console.log(
			`design: ${design.name} (sha256 ${design.sha256.slice(0, 12)}…, ${design.source.upstream}@${design.source.commit.slice(0, 7)})`,
		);
		if (!target.manifest.ui)
			console.log(
				`⚠ target '${target.manifest.name}' is not a UI target — DESIGN.md will be placed but adherence scoring is skipped`,
			);
	}

	registry.basePrompt = renderTargetPrompt(
		registry.basePrompt,
		target,
		design?.name,
	);
	const sha = target.prdSha256;
	const planSha = target.testPlanSha256;

	const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	const runDir = join("runs", runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });

	const requestedSnapshot =
		arg("snapshot") ??
		(config.harness === "zerocode"
			? undefined
			: (defaults.snapshot as string | undefined));
	const provider = createProvider(config.provider, {
		snapshot: resolveProviderSnapshot(
			config.provider,
			config.harness,
			requestedSnapshot,
		),
		worktreeBaseDir: join(runDir, "sandboxes"),
	});
	if (provider.preflight) {
		await provider.preflight({
			trialWallClockMs: config.budget.trialWallClockMs,
			concurrency: config.concurrency,
			requiredProbe: preflightProbeForHarness(config.harness),
		});
		console.log(
			`preflight OK: ${provider.id} (${provider.snapshotId ?? "no image"})`,
		);
	}

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
			designContent: design?.content,
			harnessVersion: arg("harness-version") ?? harness.defaultVersion,
			workerEnv,
			workerModelFlag,
			workerModelRef,
		},
	);

	if (flag("grade")) {
		const driver = arg("driver") === "sdk" ? "sdk" : "cc";
		await gradeTrials(trials, {
			target,
			design,
			registry,
			judgeModel: config.judgeModel,
			runDir,
			driver,
			log: (m) => console.log(m),
		});
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
		throw new Error(
			"usage: model probe <profile>   (1-token connectivity check)",
		);
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

async function cmdInit(): Promise<void> {
	const name = arg("target");
	const spec = arg("spec");
	if (!name || !spec) {
		throw new Error(
			"usage: init --target <name> --spec <file>   scaffold a target from a spec doc",
		);
	}
	const { dir, prdSha256, files } = scaffoldTarget(name, spec);
	console.log(`scaffolded target '${name}' at ${dir}`);
	console.log(`  PRD sha256: ${prdSha256.slice(0, 12)}…`);
	for (const f of files) console.log(`  + ${f}`);
	console.log(
		"\nnext: fill the TODOs in target.yaml + testplan.yaml (human review required),",
	);
	console.log(`then: bun run src/cli.ts validate --target ${name}`);
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

async function cmdCleanup(): Promise<void> {
	// Reap orphaned he-* trial containers left by crashed runs, using each CLI's
	// OWN listing verb (the Apple `container` CLI has no docker-style
	// `ps --format`, so the old docker-shaped query silently skipped macos-vz and
	// never freed a wedged VM) and the same bounded escalating teardown as
	// per-trial destroy (harden-container-teardown).
	const { cli, tearDownContainer, parseContainerListNames } = await import(
		"./providers/cli-container"
	);
	const { reapAppleContainer } = await import("./providers/reap");

	const clis = [
		{
			binary: "docker",
			listArgs: ["ps", "-a", "--format", "{{.Names}}"],
			parse: (o: string) => o.split("\n").map((s) => s.trim()).filter(Boolean),
			reapProcesses: undefined as undefined | ((n: string) => Promise<number>),
		},
		{
			binary: "container",
			listArgs: ["list", "-a"],
			parse: parseContainerListNames,
			reapProcesses: (n: string) => reapAppleContainer(n),
		},
	];

	for (const c of clis) {
		const ls = await cli(c.binary, c.listArgs, { timeoutMs: 15_000 });
		if (ls.exitCode !== 0) {
			console.log(`${c.binary}: unavailable — skipped`);
			continue;
		}
		const orphans = c.parse(ls.stdout).filter((n) => n.startsWith("he-"));
		if (orphans.length === 0) {
			console.log(`${c.binary}: no orphaned he-* containers`);
			continue;
		}
		for (const name of orphans) {
			const res = await tearDownContainer({
				binary: c.binary,
				name,
				reapProcesses: c.reapProcesses,
				log: (m) => console.log(m),
			});
			console.log(
				`${c.binary}: ${name} → ${res.freed ? `freed (${res.method})` : "LEAKED — see message above"}`,
			);
		}
	}
}

const cmd = process.argv[2];
const commands: Record<string, () => Promise<void>> = {
	validate: cmdValidate,
	init: cmdInit,
	catalog: cmdCatalog,
	model: cmdModel,
	run: cmdRun,
	report: cmdReport,
	cleanup: cmdCleanup,
};
const handler = commands[cmd ?? ""];
if (!handler) {
	console.error(
		"usage: cli.ts <validate|init|catalog|model|run|report> [options]   (see file header)",
	);
	process.exit(2);
}
await handler();
