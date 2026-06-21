import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { loadCatalogSafe } from "../catalog";
import { listHarnesses, loadHarnesses } from "../harnesses";
import { judgeWorkerRelation, loadModels, resolveProfile } from "../models";
import { loadRegistry } from "../registry";
import { IsolationProviderId, RunConfig, type Weights } from "../types";
import {
	type ProviderStatus,
	providerAvailability,
	providerUnavailableReason,
} from "./provider-availability";

const REGISTRY_PATH = "config/registry.yaml";
const DEFAULTS_PATH = "config/run.defaults.yaml";

export interface TargetOption {
	name: string;
	summary: string;
	shape: string;
	expectedUI: string;
}

export interface StudioOptions {
	targets: string[];
	/** Catalog metadata per target so the picker shows what will be built. */
	targetCatalog: TargetOption[];
	candidates: { id: string; name: string; harnesses: string[] }[];
	harnesses: string[];
	models: { name: string; provider: string }[];
	providers: string[];
	/** Per-provider configuration status (e.g. daytona/e2b need an API key). */
	providerStatus: ProviderStatus[];
	defaults: Record<string, unknown>;
}

/** Registry-driven option sources for the Configure view (eval-studio spec). */
export function studioOptions(): StudioOptions {
	const harnessRegistry = loadHarnesses();
	const registry = loadRegistry(REGISTRY_PATH, harnessRegistry);
	const models = loadModels();
	const defaults = existsSync(DEFAULTS_PATH)
		? (parse(readFileSync(DEFAULTS_PATH, "utf8")) as Record<string, unknown>)
		: {};
	const targets = existsSync("targets")
		? readdirSync("targets").filter((d) =>
				existsSync(`targets/${d}/target.yaml`),
			)
		: [];
	// Catalog metadata for the picker (eval-studio: show what will be built before
	// launch). Loaded defensively so a mid-edit target never 500s the options API.
	const targetCatalog: TargetOption[] = loadCatalogSafe().map((e) => ({
		name: e.name,
		summary: e.summary,
		shape: e.shape,
		expectedUI: e.expectedUI,
	}));
	return {
		targets,
		targetCatalog,
		candidates: registry.candidates.map((c) => ({
			id: c.id,
			name: c.name,
			harnesses: Object.keys(c.harnesses),
		})),
		harnesses: listHarnesses(harnessRegistry).map((h) => h.id),
		models: [...models.values()].map((m) => ({
			name: m.name,
			provider: m.provider,
		})),
		providers: IsolationProviderId.options,
		providerStatus: providerAvailability(),
		defaults,
	};
}

export interface StudioRunRequest {
	target: string;
	candidates: string[];
	harness: string;
	workerModel: string;
	/** Grader (judge) model profile; defaults to claude-sonnet-4-6. Must differ
	 *  from the worker model (self-grading is disallowed). */
	judgeModel?: string;
	provider: string;
	trials: number;
	weights: Weights;
	grade?: boolean;
	/** Concurrent trials; defaults per provider (1 on resource-capped daytona). */
	concurrency?: number;
	/** Optional design-system selection (design-adherence). */
	design?: string;
	/** Explicit acknowledgement of the budget envelope — required for a real run. */
	confirmed?: boolean;
	/** Operator token presented for launch authorization, if configured. */
	operatorToken?: string;
}

/**
 * Default concurrency for a provider. Daytona's free tier is ~10GiB / effectively
 * concurrency-1, so a multi-trial run at the global default (2) overcommits it and
 * gets sandboxes reclaimed mid-build — default it to 1. Local/cloud providers with
 * headroom keep 2.
 */
export function defaultConcurrency(provider?: string): number {
	return provider === "daytona" ? 1 : 2;
}

export interface ValidationResult {
	errors: string[];
	command?: string;
	budget?: {
		totalTrials: number;
		maxCostUsd: number;
		wallClockHours: number;
		note: string;
	};
}

/**
 * Validate a run request against the SAME rules the CLI enforces (RunConfig +
 * registry resolution), so studio rejections are identical to CLI ones. Returns
 * inline errors; on success, the equivalent CLI command and a budget envelope.
 */
export function validateRunRequest(
	req: Partial<StudioRunRequest>,
): ValidationResult {
	const errors: string[] = [];
	const opts = studioOptions();

	if (!req.target || !opts.targets.includes(req.target))
		errors.push(`target: choose one of ${opts.targets.join(", ")}`);
	if (req.harness && !opts.harnesses.includes(req.harness))
		errors.push(`harness: unknown '${req.harness}'`);
	if (req.provider && !opts.providers.includes(req.provider))
		errors.push(`provider: unknown '${req.provider}'`);
	else if (req.provider) {
		const reason = providerUnavailableReason(req.provider);
		if (reason) errors.push(`provider: ${reason}`);
	}

	const cands = req.candidates ?? [];
	if (cands.length === 0) errors.push("candidates: select at least one");
	for (const id of cands) {
		const c = opts.candidates.find((x) => x.id === id);
		if (!c) {
			errors.push(`candidate '${id}': not in the registry`);
		} else if (req.harness && !c.harnesses.includes(req.harness)) {
			errors.push(
				`candidate '${id}': no '${req.harness}' section (supports ${c.harnesses.join(", ")})`,
			);
		}
	}

	// Harness/provider compatibility: harnesses whose binary lives only in the
	// trial image (zerocode's `zeroclaw` + bundled ACP client; Codex's CLI) cannot
	// run on the `worktree` provider, which executes on the host. Require an
	// image-based provider (docker / daytona / e2b / macos-vz).
	const IMAGE_ONLY_HARNESSES = new Set(["zerocode", "codex"]);
	if (
		req.harness &&
		IMAGE_ONLY_HARNESSES.has(req.harness) &&
		req.provider === "worktree"
	) {
		errors.push(
			`harness '${req.harness}' needs an image-based provider (docker, daytona, e2b, macos-vz) — the worktree provider runs on the host, which has no '${req.harness}' binary. Build the trial image and select e.g. provider=docker.`,
		);
	}

	// Worker + judge models must resolve (implicit claude-* or a declared profile),
	// and the judge must differ from the worker (self-grading is disallowed — the
	// same guardrail the CLI enforces). Cross-vendor judging is allowed.
	const models = loadModels();
	let workerProfile: ReturnType<typeof resolveProfile> | undefined;
	if (req.workerModel) {
		try {
			workerProfile = resolveProfile(req.workerModel, models);
		} catch (e) {
			errors.push(`workerModel: ${(e as Error).message}`);
		}
	}
	if (req.judgeModel) {
		try {
			const judgeProfile = resolveProfile(req.judgeModel, models);
			if (workerProfile) judgeWorkerRelation(workerProfile, judgeProfile);
			// Grading runs on the Claude Code subscription (`claude -p --model
			// <judge>`), which can only drive Anthropic-compatible models. A Codex
			// (OpenAI) judge like gpt-5-codex fails at grading time with "model may
			// not exist or you may not have access" — reject it up front.
			if (judgeProfile.transport === "codex") {
				errors.push(
					`judgeModel '${req.judgeModel}': grading uses Claude Code, which can't drive a Codex/OpenAI model. Pick a Claude grader (e.g. claude-sonnet-4-6).`,
				);
			}
		} catch (e) {
			errors.push(`judgeModel: ${(e as Error).message}`);
		}
	}

	// RunConfig parse mirrors trials>0, weights sum to 1, budget shape, etc.
	let config: RunConfig | undefined;
	try {
		config = RunConfig.parse({
			candidates: cands.length ? cands : ["_"],
			harness: req.harness,
			model: req.workerModel,
			...(req.judgeModel ? { judgeModel: req.judgeModel } : {}),
			trialsPerCandidate: req.trials,
			provider: req.provider,
			concurrency: req.concurrency ?? defaultConcurrency(req.provider),
			weights: req.weights,
			...(opts.defaults.budget ? { budget: opts.defaults.budget } : {}),
		});
	} catch (e) {
		const msg = (e as { issues?: { message: string }[] }).issues
			?.map((i) => i.message)
			.join("; ");
		errors.push(`config: ${msg ?? (e as Error).message}`);
	}

	if (errors.length || !config) return { errors };

	const totalTrials = cands.length * config.trialsPerCandidate;
	const maxCostUsd = Math.min(
		totalTrials * config.budget.trialCostUsd,
		config.budget.runCostUsd,
	);
	const wallClockHours =
		(totalTrials * config.budget.trialWallClockMs) /
		Math.max(1, config.concurrency) /
		3_600_000;

	return {
		errors: [],
		command: cliCommand(req as StudioRunRequest),
		budget: {
			totalTrials,
			maxCostUsd,
			wallClockHours,
			note: "REAL SPEND — builds bill your Claude subscription (or the worker model's provider). Smoke n=1 before any matrix.",
		},
	};
}

/** The equivalent CLI invocation for a validated request (copy mode). */
export function cliCommand(req: StudioRunRequest): string {
	const parts = [
		"bun run src/cli.ts run",
		`--target ${req.target}`,
		`--candidates ${req.candidates.join(",")}`,
		`--trials ${req.trials}`,
		`--provider ${req.provider}`,
	];
	if (req.workerModel && req.workerModel !== "claude-opus-4-6")
		parts.push(`--worker-model ${req.workerModel}`);
	if (req.judgeModel && req.judgeModel !== "claude-sonnet-4-6")
		parts.push(`--judge-model ${req.judgeModel}`);
	const conc = req.concurrency ?? defaultConcurrency(req.provider);
	if (conc !== 2) parts.push(`--concurrency ${conc}`);
	if (req.design) parts.push(`--design ${req.design}`);
	if (req.grade) parts.push("--grade");
	return parts.join(" ");
}
