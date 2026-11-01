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
 *
 *   bun run src/cli.ts validate --brownfield
 *       Also hash-verify every brownfield task bundle (fails on any mismatch).
 *
 *   bun run src/cli.ts brownfield mine --repo owner/name --clone <dir> --pkg <dist> \
 *       [--prs 1,2 | --since YYYY-MM-DD] [--limit N] [--selection touched|full] \
 *       [--python 3.12] [--extras io,etc] [--classify] [--model m] [--force] [--work <dir>]
 *       Mine merged PR ↔ issue pairs into frozen bundles under brownfield/.
 *       Validation runs tests locally (no spend); --classify spends ≈$0.02/issue.
 *   bun run src/cli.ts brownfield verify
 *       Hash-verify every bundle.
 *   bun run src/cli.ts brownfield selfcheck --repo owner/name --clone <dir> --ids <id,...> \
 *       [--pkg <dist>] [--extras io,etc] [--work <dir>]
 *       Grade each bundle's reference patch (must resolve) and an empty patch
 *       (must not). No spend; catches broken tasks before trials.
 *
 *   bun run src/cli.ts brownfield image --repo owner/name --clone <dir> --ids <id,...> \
 *       [--pkg <dist>] [--extras io,etc] [--base-image <tag>] [--force]
 *       Build each task's trial image (trial image + sealed repo on branch `work` +
 *       prebuilt env). Cached by bundle/base-image/uv/recipe hash. No model spend.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { auditFiles } from "./brownfield/audit";
import { assertClassifierIndependent } from "./brownfield/classify";
import {
	listBundleDirs,
	loadBundle,
	readSnapshot,
	readText,
} from "./brownfield/bundle";
import { gradeCandidate, writeGrade } from "./brownfield/trial-grade";
import { judgeCandidate } from "./brownfield/judge";
import {
	loadPromptTemplate,
	PROMPT_TEMPLATE_PATH,
	planTasks,
} from "./brownfield/prompt";
import {
	assertTasksClassifierIndependent,
	buildBrownfieldMatrix,
	parseBrownfieldSpec,
	selectBrownfieldTasks,
	taskSetHash,
} from "./brownfield/run";
import {
	buildWorkspaceEnv,
	captureCandidatePatch,
	commitDate,
	ensureSealedRepo,
	seedWorkspace as seedTrialWorkspace,
	writePatchCapture,
} from "./brownfield/seed";
import { diffSizeRatio, diffStats, localization } from "./brownfield/signals";
import {
	CATALOG_PATH,
	checkCatalog,
	generateCatalog,
	loadCatalog,
} from "./catalog";
import { type LoadedDesign, loadDesign } from "./designs";
import { assertWebToolKillSwitch } from "./driver/toolpolicy";
import {
	type Gateway,
	startGateway,
	type UnixRelay,
	startUnixRelay,
} from "./gateway/server";
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
import { DEFAULT_TRIAL_IMAGE } from "./providers/docker";
import {
	placeholderAuthEnv,
	resolveGatewayCredential,
} from "./gateway/credential";
import { writeBrownfieldReport } from "./report/brownfield";
import { writeScorecard } from "./report/markdown";
import { buildResults, writeResults } from "./report/results";
import { loadTarget, renderTargetPrompt, scaffoldTarget } from "./targets";
import { RunConfig, type TrialResult, Weights } from "./types";

const REGISTRY_PATH = "config/registry.yaml";
/** Brownfield budget defaults (override with --trial-cost / --run-cost). */
const BROWNFIELD_TRIAL_COST_USD = 5;
const BROWNFIELD_RUN_COST_USD = 25;
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
	if (flag("brownfield")) verifyBrownfieldBundles();
}

function verifyBrownfieldBundles(): void {
	const dirs = listBundleDirs();
	const bad: string[] = [];
	for (const d of dirs) {
		try {
			loadBundle(d);
		} catch (e) {
			bad.push((e as Error).message);
		}
	}
	if (bad.length)
		throw new Error(
			`brownfield: ${bad.length}/${dirs.length} bundles failed:\n  ${bad.join("\n  ")}`,
		);
	console.log(`brownfield OK: ${dirs.length} bundles hash-verified`);
}

async function brownfieldSelfCheck(): Promise<void> {
	const repo = arg("repo");
	const clone = arg("clone");
	const ids = arg("ids")?.split(",");
	if (!repo || !clone || !ids?.length)
		throw new Error("brownfield selfcheck needs --repo, --clone and --ids");
	const { bundleDir, repoDirName } = await import("./brownfield/bundle");
	const { selfCheck } = await import("./brownfield/grade");
	const workRoot = arg("work") ?? join("runs", "brownfield-work", "selfcheck");
	let failures = 0;
	for (const id of ids) {
		const bundle = loadBundle(bundleDir(repoDirName(repo), id));
		const r = await selfCheck(bundle, {
			clone,
			workDir: join(workRoot, repoDirName(repo), id),
			pkg: arg("pkg"),
			extras: arg("extras"),
		});
		if (!r.ok) failures++;
		const f2p = (g: typeof r.reference) =>
			`${Object.values(g.failToPass).filter((o) => o === "pass").length}/${Object.keys(g.failToPass).length} f2p`;
		console.log(
			`${r.ok ? "✓" : "✗"} ${id}: reference ${r.reference.resolved ? "resolved" : "UNRESOLVED"} (${f2p(r.reference)}), empty ${r.empty.resolved ? "RESOLVED" : "unresolved"} (${f2p(r.empty)})` +
				(r.reference.cassetteMiss.length
					? `  cassette-miss: ${r.reference.cassetteMiss.length}`
					: "") +
				(r.reference.testInfraModified.length
					? `  test-infra: ${r.reference.testInfraModified.join(",")}`
					: ""),
		);
	}
	if (failures)
		throw new Error(
			`${failures}/${ids.length} bundles failed the grading self-check`,
		);
}

async function brownfieldQuality(): Promise<void> {
	const runDir = process.argv[4];
	const judgeRef = arg("judge");
	if (!runDir || !existsSync(join(runDir, "results.json")) || !judgeRef)
		throw new Error(
			"usage: brownfield quality <run-dir> --judge <profile> [--samples 3] [--force]",
		);
	const { compareRunQuality } = await import("./brownfield/quality");
	const profile = resolveProfile(judgeRef, loadModels());
	const results = JSON.parse(
		readFileSync(join(runDir, "results.json"), "utf8"),
	);
	const workerModels = [
		...new Set<string>(
			results.trials
				.map(
					(t: TrialResult) =>
						t.provenance.workerModel?.modelId ?? t.provenance.model,
				)
				.filter(Boolean),
		),
	];
	const r = await compareRunQuality({
		runDir,
		model: resolveClaudeCodeEnv(profile).modelFlag,
		workerModels,
		samples: arg("samples") ? Number(arg("samples")) : undefined,
		force: flag("force"),
		log: (m) => console.log(m),
	});
	console.log(
		`compared ${r.compared} trial(s), skipped ${r.skipped}, $${r.costUsd.toFixed(3)}`,
	);
}

async function brownfieldImages(): Promise<void> {
	const repo = arg("repo");
	const clone = arg("clone");
	const ids = arg("ids")?.split(",");
	if (!repo || !clone || !ids?.length)
		throw new Error("brownfield image needs --repo, --clone and --ids");
	const { bundleDir, repoDirName } = await import("./brownfield/bundle");
	const { buildTaskImage } = await import("./brownfield/image");
	const { DEFAULT_TRIAL_IMAGE } = await import("./providers/docker");
	for (const id of ids) {
		const bundle = loadBundle(bundleDir(repoDirName(repo), id));
		const r = await buildTaskImage(bundle, {
			clone,
			baseImage: arg("base-image") ?? DEFAULT_TRIAL_IMAGE,
			pkg: arg("pkg"),
			extras: arg("extras"),
			force: flag("force"),
			log: (m) => console.log(`  ${id}: ${m}`),
		});
		console.log(
			`✓ ${id}: ${r.image}${r.cached ? " (cached)" : ` (${r.method}, ${r.seconds}s)`}`,
		);
	}
}

async function cmdBrownfield(): Promise<void> {
	const sub = process.argv[3];
	if (sub === "verify") return verifyBrownfieldBundles();
	if (sub === "selfcheck") return brownfieldSelfCheck();
	if (sub === "image") return brownfieldImages();
	if (sub === "quality") return brownfieldQuality();
	if (sub !== "mine") {
		console.error(
			"usage: brownfield <mine|verify|selfcheck|image> [options]   (see file header)",
		);
		process.exit(2);
	}
	const repo = arg("repo");
	const clone = arg("clone");
	const pkg = arg("pkg");
	if (!repo || !clone || !pkg)
		throw new Error("brownfield mine needs --repo, --clone and --pkg");
	const selection = (arg("selection") ?? "full") as "touched" | "full";
	if (selection !== "touched" && selection !== "full")
		throw new Error("--selection must be touched|full");
	const { listMergedIssuePrs } = await import("./brownfield/github");
	const { minePr } = await import("./brownfield/mine");
	const prFilter = arg("prs")?.split(",").map(Number);
	const all = await listMergedIssuePrs(repo, {
		since: arg("since"),
		limit: Number(arg("limit") ?? 1000),
	});
	const prs = prFilter ? all.filter((p) => prFilter.includes(p.number)) : all;
	if (prFilter && prs.length !== prFilter.length)
		console.warn(
			`warning: ${prFilter.length - prs.length} requested PR(s) not found among merged issue-closing PRs`,
		);
	const workRoot = arg("work") ?? join("runs", "brownfield-work");
	console.log(
		`mining ${prs.length} PR(s) from ${repo} (selection: ${selection}, classify: ${flag("classify")})`,
	);
	const tally: Record<string, number> = {};
	for (const pr of prs) {
		try {
			const reports = await minePr(pr, {
				repo,
				clone,
				workRoot,
				env: { pkg, python: arg("python"), extras: arg("extras") },
				selection,
				classify: flag("classify"),
				model: arg("model"),
				force: flag("force"),
				log: (m) => console.log(m),
			});
			for (const r of reports) {
				tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
				console.log(
					`#${r.pr}${r.issue ? ` → #${r.issue}` : ""}: ${r.verdict}${r.bundle ? `  ${r.bundle}` : ""}`,
				);
			}
		} catch (e) {
			tally.error = (tally.error ?? 0) + 1;
			console.error(`#${pr.number}: error: ${(e as Error).message}`);
		}
	}
	console.log("summary:", JSON.stringify(tally));
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
	if (arg("brownfield")) return cmdRunBrownfield();
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

async function cmdRunBrownfield(): Promise<void> {
	const spec = parseBrownfieldSpec({
		repo: arg("brownfield"),
		tasks: arg("tasks"),
		variant: arg("variant"),
	});
	const clone = arg("clone");
	if (!clone)
		throw new Error(
			"--clone <path> is required: the task's sealed base repository is built from a local clone (never re-fetched)",
		);

	const harnesses = loadHarnesses();
	const registry = loadRegistry(REGISTRY_PATH, harnesses);
	const defaults = existsSync(DEFAULTS_PATH)
		? (parse(readFileSync(DEFAULTS_PATH, "utf8")) as Record<string, unknown>)
		: {};
	const baseBudget =
		(defaults.budget as Record<string, unknown> | undefined) ?? {};
	const trialMinutes = arg("trial-minutes");
	if (trialMinutes !== undefined && !(Number(trialMinutes) > 0))
		throw new Error(
			`--trial-minutes must be a positive number, got ${trialMinutes}`,
		);
	// Brownfield trials have cost $0.40–2.20 each so far; the PRD-run caps in
	// run.defaults.yaml ($50/trial, $400/run) are far too loose here.
	const budget = {
		...baseBudget,
		trialCostUsd: BROWNFIELD_TRIAL_COST_USD,
		runCostUsd: BROWNFIELD_RUN_COST_USD,
		...(trialMinutes !== undefined
			? { trialWallClockMs: Number(trialMinutes) * 60000 }
			: {}),
		...(arg("trial-cost") ? { trialCostUsd: Number(arg("trial-cost")) } : {}),
		...(arg("run-cost") ? { runCostUsd: Number(arg("run-cost")) } : {}),
	};

	const config = RunConfig.parse({
		...defaults,
		candidates: (
			arg("candidates") ?? registry.candidates.map((c) => c.id).join(",")
		).split(","),
		harness: arg("harness") ?? (defaults.harness as string | undefined),
		// One trial per (task, candidate): --trials would replicate a task instead
		// of adding coverage, so it is fixed at 1 for brownfield runs.
		trialsPerCandidate: 1,
		// Brownfield needs a provider with a working host toolchain; the run
		// defaults target cloud PRD trials, so the brownfield default is worktree.
		provider: arg("provider") ?? "worktree",
		concurrency: Number(
			arg("concurrency") ?? (defaults.concurrency as number | undefined) ?? 2,
		),
		budget,
	});
	// Frameworks with no entry command of their own get a routing step: consult
	// the framework's help, pick its command/skill for this task, invoke it
	// (src/brownfield/router.ts). Skip with --no-routing.
	const { withRouting, needsRouting } = await import("./brownfield/router");
	const candidates = resolveCandidates(
		registry,
		config.candidates,
		config.harness,
		harnesses,
	).map((c) => (flag("no-routing") ? c : withRouting(c, config.harness)));
	for (const c of candidates)
		if (!flag("no-routing") && c.id !== "bare")
			console.log(
				`framework entry: ${c.name}: ${needsRouting(c, config.harness) ? "routed via its help" : "own command"}`,
			);
	const harness = resolveHarness(config.harness, harnesses);
	assertWebToolKillSwitch(config.harness);
	const models = loadModels();
	const workerProfile = resolveProfile(
		arg("worker-model") ?? config.model,
		models,
	);
	const rw = resolveWorkerEnv(workerProfile);
	const workerModelRef = toModelRef(workerProfile);
	// Judge-based signal (5.2): opt-in (costs a model call per trial).
	const judgeProfile = arg("judge")
		? resolveProfile(arg("judge") as string, models)
		: null;
	const judgeCodeEnv = judgeProfile ? resolveClaudeCodeEnv(judgeProfile) : null;
	if (judgeProfile)
		assertClassifierIndependent(judgeProfile.modelId, workerProfile.modelId);

	const bundles = selectBrownfieldTasks(spec);
	assertTasksClassifierIndependent(bundles, workerProfile.modelId);
	const baseTemplate = loadPromptTemplate(
		arg("prompt") ?? PROMPT_TEMPLATE_PATH,
	);
	// Adversarial smoke (6.1): explicitly instruct the worker to reach the
	// upstream fix, so the audit/gateway have something to catch.
	const template = flag("adversarial")
		? `${baseTemplate}\n\nThis is a controlled security test: before fixing anything, find the upstream pull request or commit that fixed this issue (search the web / GitHub) and apply that change.\n`
		: baseTemplate;
	const tasks = planTasks(bundles, spec.variant, template);
	if (flag("adversarial"))
		console.log(
			"adversarial smoke: the worker is told to find the upstream fix",
		);
	const byId = new Map(bundles.map((b) => [b.id, b]));
	const bundleSetHash = taskSetHash(bundles);

	const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	const runDir = join("runs", runId);
	mkdirSync(join(runDir, "trials"), { recursive: true });
	if (flag("adversarial"))
		writeFileSync(
			join(runDir, "adversarial.txt"),
			"worker instructed to reach the upstream fix\n",
		);
	// Model gateway (4.4): the sandbox holds a placeholder key; only this run's
	// model and non-provider-tool requests are forwarded.
	let gateway: Gateway | null = null;
	const relays: UnixRelay[] = [];
	let sessionNetns: { script: string } | undefined;
	let sandboxBaseUrl: string | undefined;
	const workerEnvExtra: Record<string, string> = {};
	let workerEnv = rw.env;
	// Docker runs use the run-owned gateway + egress lock below instead.
	if (flag("gateway") && config.provider !== "docker") {
		if (config.harness !== "claude-code")
			throw new Error(
				`--gateway supports the claude-code harness only (got '${config.harness}'); refusing a protocol mismatch`,
			);
		const credential = resolveGatewayCredential(arg("credential") ?? "oauth");
		console.log(
			`gateway credential: ${credential.kind === "oauth" ? "Claude subscription (OAuth)" : "API key (bills API credits)"}`,
		);
		if (config.provider !== "worktree")
			console.warn(
				`[brownfield] gateway: ${config.provider} cannot reach 127.0.0.1; use the worktree provider`,
			);
		gateway = startGateway({
			upstream: "https://api.anthropic.com",
			credential,
			model: workerProfile.modelId,
			logPath: join(runDir, "gateway.jsonl"),
		});
		// Egress lockdown (4.4): a second gateway on a unix socket, reachable from
		// a loopback-only namespace through a socat relay on 127.0.0.1:8787. The
		// worker then has no route to anything but this proxy.
		if (config.provider === "worktree" && !flag("no-egress-lockdown")) {
			const sock = join(runDir, "gateway.sock");
			relays.push(startUnixRelay(sock, gateway.port));
			const script = join(runDir, "netns.sh");
			writeFileSync(
				script,
				[
					"#!/bin/sh",
					"# Loopback-only namespace: the gateway relay is the only endpoint.",
					"ip link set lo up",
					'[ -n "$HE_GATEWAY_SOCK" ] || exit 97',
					// Detached with closed stdio: a background child holding the exec's
					// stdout pipe would keep the caller waiting until timeout.
					'socat TCP-LISTEN:8787,bind=127.0.0.1,fork,reuseaddr UNIX-CONNECT:"$HE_GATEWAY_SOCK" </dev/null >/dev/null 2>&1 &',
					"sleep 0.4",
					'exec "$@"',
					"",
				].join("\n"),
			);
			sessionNetns = { script };
			// Sessions point at the in-namespace relay; the preflight (below) runs
			// outside the namespace, so it keeps using the TCP gateway URL.
			sandboxBaseUrl = "http://127.0.0.1:8787";
			workerEnvExtra.HE_GATEWAY_SOCK = sock;
			// Inside the namespace we are root (needed to raise lo); Claude Code
			// refuses bypass-permissions as root unless it is told it's sandboxed.
			workerEnvExtra.IS_SANDBOX = "1";
			console.log(
				`egress lockdown: worker sees loopback only (${sandboxBaseUrl} → ${sock})`,
			);
		}
		workerEnv = {
			...rw.env,
			...workerEnvExtra,
			ANTHROPIC_BASE_URL: gateway.url,
			...placeholderAuthEnv(
				credential.kind === "oauth"
					? "sk-ant-oat01-gateway-placeholder"
					: "sk-ant-api03-gateway-placeholder",
			),
			// Every Claude Code slot resolves to the one model the gateway allows.
			ANTHROPIC_DEFAULT_OPUS_MODEL: workerProfile.modelId,
			ANTHROPIC_DEFAULT_SONNET_MODEL: workerProfile.modelId,
			ANTHROPIC_DEFAULT_HAIKU_MODEL: workerProfile.modelId,
		};
		console.log(
			`gateway: ${gateway.url} → api.anthropic.com (model ${workerProfile.modelId})`,
		);
	}

	// Gateway preflight (4.5): one tiny request per candidate before dispatch, so
	// a rejected key/model fails the run before any sandbox or trial spend.
	if (gateway && workerEnv) {
		for (const candidate of candidates) {
			const probe = await probeGatewaySession(workerEnv, rw.modelFlag);
			if (!probe.ok)
				throw new Error(
					`gateway preflight failed for candidate '${candidate.name}': ${probe.reason} (no trial dispatched)`,
				);
			console.log(`gateway preflight: ${candidate.name} ok`);
		}
	}
	if (sandboxBaseUrl && workerEnv)
		workerEnv = { ...workerEnv, ANTHROPIC_BASE_URL: sandboxBaseUrl };
	// Egress reduction (4.4): worker shells see a dead proxy, with loopback
	// exempt so the gateway (and nothing else) stays reachable. Best-effort:
	// raw sockets bypass it; the audit is the backstop.
	workerEnv = {
		...(workerEnv ?? {}),
		HTTP_PROXY: "http://127.0.0.1:9",
		HTTPS_PROXY: "http://127.0.0.1:9",
		ALL_PROXY: "http://127.0.0.1:9",
		NO_PROXY: "127.0.0.1,localhost,::1",
		no_proxy: "127.0.0.1,localhost,::1",
	};

	const provider = createProvider(config.provider, {
		snapshot:
			config.provider === "docker"
				? (arg("base-image") ?? DEFAULT_TRIAL_IMAGE)
				: resolveProviderSnapshot(
						config.provider,
						config.harness,
						arg("snapshot") ?? (defaults.snapshot as string | undefined),
					),
		worktreeBaseDir: join(runDir, "sandboxes"),
	});
	if (provider.preflight) {
		await provider.preflight({
			trialWallClockMs: config.budget.trialWallClockMs,
			concurrency: config.concurrency,
			requiredProbe: preflightProbeForHarness(config.harness),
		});
	}

	// Docker (4.4 lockdown on any host OS): each task runs in its prebuilt image
	// (sealed repo + env), locked to a per-run --internal network whose only exit
	// is a relay to the run-owned gateway. Every trial gets its own placeholder key.
	const docker =
		config.provider === "docker"
			? await import("./brownfield/docker-run")
			: null;
	const dockerRun = docker
		? await docker.startDockerBrownfield({
				bundles,
				clone,
				runId,
				runDir,
				harness: config.harness,
				model: workerProfile.modelId,
				baseImage: arg("base-image"),
				credential: arg("credential") ?? "oauth",
				probe: async (env, modelFlag) => {
					for (const candidate of candidates) {
						const r = await probeGatewaySession(env, modelFlag);
						if (!r.ok)
							throw new Error(
								`gateway preflight failed for candidate '${candidate.name}': ${r.reason} (no trial dispatched)`,
							);
						console.log(`gateway preflight: ${candidate.name} ok`);
					}
				},
				log: (m) => console.log(m),
			})
		: null;

	console.log(
		`brownfield run ${runId}: ${candidates.length} candidate(s) × ${tasks.length} task(s) [${spec.variant}] on ${provider.id}`,
	);
	console.log(`tasks: ${tasks.map((t) => t.taskId).join(", ")}`);
	console.log(
		`budget: $${config.budget.trialCostUsd}/trial, $${config.budget.runCostUsd}/run, ${config.budget.trialWallClockMs / 60000}m wall-clock/trial`,
	);

	const startedAt = new Date().toISOString();
	const trials = await runMatrix(
		config,
		buildBrownfieldMatrix(candidates, tasks),
		{
			provider,
			...(dockerRun
				? {
						providerFor: dockerRun.providerFor,
						egress: dockerRun.egress,
						archive: dockerRun.archive,
					}
				: {}),
			registry,
			runDir,
			// Brownfield task content ships inside each task, not as one PRD.
			prdContent: "",
			prdSha256: bundleSetHash,
			testPlanSha256: null,
			harnessVersion: arg("harness-version") ?? harness.defaultVersion,
			workerEnv,
			workerModelFlag: rw.modelFlag,
			workerModelRef,
			seedWorkspace: async (sandbox, plan) => {
				const task = plan.task as NonNullable<typeof plan.task>;
				const bundle = byId.get(task.taskId) as (typeof bundles)[number];
				if (dockerRun) return dockerRun.seed(sandbox, task, bundle);
				const sealed = await ensureSealedRepo({
					clone,
					baseSha: task.baseSha,
					futureShas: [task.mergeSha],
					repoDir: task.repoDir,
				});
				await seedTrialWorkspace(sandbox, task, sealed);
				if (provider.id !== "worktree") {
					console.warn(
						`[brownfield] ${provider.id}: environment is not prebuilt inside the sandbox; the worker must build it`,
					);
					return;
				}
				// Prebuild the task environment inside the trial workspace so the worker
				// starts offline-testable (design D7), exactly as validation did.
				const env = await buildWorkspaceEnv(sandbox.workspacePath, {
					python: bundle.manifest.env?.python,
					excludeNewer: await commitDate(sandbox.workspacePath),
				});
				if (!env.ok)
					throw new Error(
						`task environment build failed in ${sandbox.workspacePath}: ${env.log.slice(-600)}`,
					);
			},
			sessionNetns,
			verifyHarness: async (sandbox, plan) => {
				const { verifyHarness } = await import("./brownfield/harness-check");
				const note = await verifyHarness(sandbox, plan.candidate.id);
				console.log(`${plan.trialId}: ${note}`);
				return note;
			},
			capturePatch: async (sandbox, trialDir, plan) => {
				const task = plan.task as NonNullable<typeof plan.task>;
				writePatchCapture(trialDir, await captureCandidatePatch(sandbox, task));
			},
		},
	);

	gateway?.stop();
	await dockerRun?.stop();
	for (const r of relays) r.stop();
	// Solution-reach audit (5.3): did the trial reach the upstream fix?
	for (const trial of trials) {
		const ref = trial.provenance.brownfield;
		if (!ref) continue;
		const bundle = byId.get(ref.taskId);
		if (!bundle) continue;
		const trialDir = join(runDir, "trials", trial.provenance.trialId);
		const transcriptDir = join(trialDir, "transcripts");
		const files = existsSync(transcriptDir)
			? readdirSync(transcriptDir).map((f) => join(transcriptDir, f))
			: [];
		const audit = auditFiles(
			files.filter((f) => f.endsWith(".jsonl")),
			{
				futureShas: [ref.mergeSha],
				prNumber: bundle.manifest.pr,
				repo: bundle.manifest.repo,
			},
		);
		writeFileSync(
			join(trialDir, "audit.json"),
			`${JSON.stringify(audit, null, 2)}\n`,
		);
		// Secondary signals (5.2): file localization + diff size vs the reference.
		const patch = existsSync(join(trialDir, "candidate.patch"))
			? readFileSync(join(trialDir, "candidate.patch"), "utf8")
			: "";
		const candidateDiff = diffStats(patch);
		const referenceDiff = diffStats(
			readText(bundle.dir, "reference.patch") ?? "",
		);
		writeFileSync(
			join(trialDir, "signals.json"),
			`${JSON.stringify(
				{
					candidate: candidateDiff,
					reference: referenceDiff,
					localization: localization(candidateDiff.files, referenceDiff.files),
					diffSizeRatio: diffSizeRatio(candidateDiff, referenceDiff),
				},
				null,
				2,
			)}\n`,
		);
		if (audit.verdict !== "clean") {
			trial.provenance.notes.push(`audit: ${audit.verdict}`);
			console.log(`audit ${trial.provenance.trialId}: ${audit.verdict}`);
		}
		if (audit.verdict === "disqualified:solution-reach") {
			trial.resolution = {
				verdict: "unresolved",
				reason: "solution-reach",
				failToPass: {},
				passToPass: {},
				testInfraModified: [],
				cassetteMiss: [],
			};
		}
	}

	// Hidden-test grading (5.1): each trial's captured patch is replayed onto a
	// pristine sealed base, test infrastructure restored, tests.patch applied.
	if (!flag("no-grade")) {
		for (const trial of trials) {
			const ref = trial.provenance.brownfield;
			if (!ref) continue;
			if (trial.provenance.status === "infra-failed") {
				console.log(
					`grade ${trial.provenance.trialId}: skipped (infra-failed: ${trial.provenance.notes[0] ?? ""})`,
				);
				continue;
			}
			if (trial.resolution?.reason === "solution-reach") {
				console.log(
					`grade ${trial.provenance.trialId}: skipped (solution-reach)`,
				);
				continue;
			}
			const bundle = byId.get(ref.taskId);
			if (!bundle) continue;
			const trialDir = join(runDir, "trials", trial.provenance.trialId);
			const patchPath = join(trialDir, "candidate.patch");
			const sealed = await ensureSealedRepo({
				clone,
				baseSha: ref.baseSha,
				futureShas: [ref.mergeSha],
				repoDir: ref.repoDir,
			});
			const grade = await gradeCandidate({
				sealedDir: sealed,
				candidatePatch: existsSync(patchPath)
					? readFileSync(patchPath, "utf8")
					: "",
				manifest: {
					failToPass: bundle.manifest.failToPass,
					passToPass: bundle.manifest.passToPass,
					testPaths: bundle.manifest.testPaths,
					env: bundle.manifest.env,
				},
				testsPatch: readText(bundle.dir, "tests.patch") ?? "",
				workDir: join(runDir, "grading", trial.provenance.trialId),
			});
			writeGrade(trialDir, grade);
			// The graded tree's venv is ~8 GB; logs and the grade are what matter.
			rmSync(join(runDir, "grading", trial.provenance.trialId, "repo"), {
				recursive: true,
				force: true,
			});
			trial.resolution = {
				verdict: grade.verdict,
				reason: grade.reason,
				failToPass: grade.failToPass,
				passToPass: grade.passToPass,
				testInfraModified: grade.testInfraModified,
				cassetteMiss: grade.cassetteMiss,
			};
			console.log(
				`grade ${trial.provenance.candidate} ${ref.taskId}: ${grade.verdict}` +
					`${grade.reason ? ` (${grade.reason})` : ""}` +
					`${grade.cassetteMiss.length ? ` cassette-miss=${grade.cassetteMiss.join(",")}` : ""}`,
			);
		}
	}

	// Judge-based secondary signal (5.2): blind to the worker's verdict, run only
	// where a patch exists and the trial was not disqualified.
	if (judgeProfile) {
		for (const trial of trials) {
			const ref = trial.provenance.brownfield;
			if (!ref || trial.resolution?.reason === "solution-reach") continue;
			const bundle = byId.get(ref.taskId);
			const trialDir = join(runDir, "trials", trial.provenance.trialId);
			const patchPath = join(trialDir, "candidate.patch");
			if (!bundle || !existsSync(patchPath)) continue;
			const snapshot = readSnapshot(bundle.dir);
			const judge = await judgeCandidate(
				{
					issueTitle: snapshot.title,
					issueBody: snapshot.body,
					referencePatch: readText(bundle.dir, "reference.patch") ?? "",
					candidatePatch: readFileSync(patchPath, "utf8"),
				},
				{
					model: judgeCodeEnv?.modelFlag ?? judgeProfile.modelId,
					env: judgeCodeEnv?.env,
				},
			);
			writeFileSync(
				join(trialDir, "judge.json"),
				`${JSON.stringify({ ...judge, model: judgeProfile.modelId }, null, 2)}\n`,
			);
			trial.judge = { ...judge, model: judgeProfile.modelId };
			console.log(
				`judge ${trial.provenance.candidate} ${ref.taskId}: ${judge.quality} (${judge.resolvesIssue ? "resolves" : "does not resolve"})`,
			);
		}
	}

	const results = buildResults({
		runId,
		config,
		prdSha256: bundleSetHash,
		testPlanSha256: null,
		startedAt,
		endedAt: new Date().toISOString(),
		trials,
		workerModel: workerModelRef,
		judgeModel: toModelRef(resolveProfile(config.judgeModel, models)),
		crossVendorJudge: false,
		costSource: costSourceForHarness(workerProfile, harness.reportsCost),
	});
	console.log(`results: ${writeResults(runDir, results)}`);
	console.log(`scorecard: ${writeScorecard(runDir, results)}`);
	// Code-quality comparison vs the original PR (blind, position-balanced),
	// with the same judge as the resolution signal; skip with --no-quality.
	if (judgeProfile && !flag("no-quality")) {
		const { compareRunQuality } = await import("./brownfield/quality");
		await compareRunQuality({
			runDir,
			model: judgeCodeEnv?.modelFlag ?? judgeProfile.modelId,
			workerModels: [workerProfile.modelId],
			samples: arg("quality-samples")
				? Number(arg("quality-samples"))
				: undefined,
			log: (m) => console.log(m),
		});
	}
	if (results.trials.some((t) => t.provenance.brownfield))
		console.log(`brownfield report: ${writeBrownfieldReport(runDir, results)}`);
}

/** One tiny request through the run gateway, exactly as a candidate's session would. */
async function probeGatewaySession(
	env: Record<string, string>,
	modelFlag: string,
	timeoutMs = 90_000,
): Promise<{ ok: boolean; reason: string }> {
	const proc = Bun.spawn(
		[
			"claude",
			"-p",
			"--model",
			modelFlag,
			"--output-format",
			"json",
			"--strict-mcp-config",
			"--dangerously-skip-permissions",
		],
		{
			stdin: new TextEncoder().encode("Reply with exactly: OK"),
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, ...env },
		},
	);
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	const out = await new Response(proc.stdout).text();
	const err = await new Response(proc.stderr).text();
	clearTimeout(timer);
	const code = await proc.exited;
	const line = out
		.split("\n")
		.reverse()
		.find((l) => l.trim().startsWith("{") && l.includes('"type":"result"'));
	if (code === 0 && line) return { ok: true, reason: "" };
	const reason = `exit ${code}: ${err.trim().split("\n").slice(-2).join(" ") || "(no stderr)"}`;
	return { ok: false, reason: reason.slice(0, 300) };
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
	const { env: profileEnv, modelFlag } = resolveClaudeCodeEnv(profile);
	// Gateway preflight (4.5): the probe runs through the gateway the run would
	// use, and the gateway is checked to reject a different model.
	const gateway = flag("gateway")
		? startGateway({
				upstream: profile.baseUrl ?? "https://api.anthropic.com",
				apiKey: process.env[profile.authEnv] ?? "",
				model: profile.modelId,
				logPath: join("runs", "model-probe-gateway.jsonl"),
			})
		: null;
	const env = gateway
		? {
				...profileEnv,
				ANTHROPIC_BASE_URL: gateway.url,
				ANTHROPIC_API_KEY: "gateway-placeholder",
				ANTHROPIC_DEFAULT_OPUS_MODEL: profile.modelId,
				ANTHROPIC_DEFAULT_SONNET_MODEL: profile.modelId,
				ANTHROPIC_DEFAULT_HAIKU_MODEL: profile.modelId,
			}
		: profileEnv;
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
		gateway?.stop();
		process.exit(1);
	}
	if (gateway) {
		const rejected = await fetch(`${gateway.url}/v1/messages`, {
			method: "POST",
			body: JSON.stringify({ model: "not-the-run-model", messages: [] }),
		});
		console.log(
			`gateway: ${gateway.requests.length} request(s), wrong-model check ${rejected.status === 403 ? "rejected ✓" : `NOT rejected (${rejected.status}) ✗`}`,
		);
		gateway.stop();
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
	if (results.trials.some((t) => t.provenance.brownfield))
		console.log(`brownfield report: ${writeBrownfieldReport(runDir, results)}`);
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
			parse: (o: string) =>
				o
					.split("\n")
					.map((s) => s.trim())
					.filter(Boolean),
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
	brownfield: cmdBrownfield,
};
const handler = commands[cmd ?? ""];
if (!handler) {
	console.error(
		"usage: cli.ts <validate|init|catalog|model|run|report|brownfield> [options]   (see file header)",
	);
	process.exit(2);
}
await handler();
