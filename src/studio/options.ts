import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { loadModels, resolveProfile } from "../models";
import { loadRegistry } from "../registry";
import {
	HarnessId,
	IsolationProviderId,
	RunConfig,
	type Weights,
} from "../types";

const REGISTRY_PATH = "config/registry.yaml";
const DEFAULTS_PATH = "config/run.defaults.yaml";

export interface StudioOptions {
	targets: string[];
	candidates: { id: string; name: string; harnesses: string[] }[];
	harnesses: string[];
	models: { name: string; provider: string }[];
	providers: string[];
	defaults: Record<string, unknown>;
}

/** Registry-driven option sources for the Configure view (eval-studio spec). */
export function studioOptions(): StudioOptions {
	const registry = loadRegistry(REGISTRY_PATH);
	const models = loadModels();
	const defaults = existsSync(DEFAULTS_PATH)
		? (parse(readFileSync(DEFAULTS_PATH, "utf8")) as Record<string, unknown>)
		: {};
	const targets = existsSync("targets")
		? readdirSync("targets").filter((d) =>
				existsSync(`targets/${d}/target.yaml`),
			)
		: [];
	return {
		targets,
		candidates: registry.candidates.map((c) => ({
			id: c.id,
			name: c.name,
			harnesses: Object.keys(c.harnesses),
		})),
		harnesses: HarnessId.options,
		models: [...models.values()].map((m) => ({
			name: m.name,
			provider: m.provider,
		})),
		providers: IsolationProviderId.options,
		defaults,
	};
}

export interface StudioRunRequest {
	target: string;
	candidates: string[];
	harness: string;
	workerModel: string;
	provider: string;
	trials: number;
	weights: Weights;
	grade?: boolean;
	/** Optional design-system selection (design-adherence). */
	design?: string;
	/** Explicit acknowledgement of the budget envelope — required for a real run. */
	confirmed?: boolean;
	/** Operator token presented for launch authorization, if configured. */
	operatorToken?: string;
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

	// Worker model must resolve (implicit claude-* or a declared profile).
	if (req.workerModel) {
		try {
			resolveProfile(req.workerModel, loadModels());
		} catch (e) {
			errors.push(`workerModel: ${(e as Error).message}`);
		}
	}

	// RunConfig parse mirrors trials>0, weights sum to 1, budget shape, etc.
	let config: RunConfig | undefined;
	try {
		config = RunConfig.parse({
			candidates: cands.length ? cands : ["_"],
			harness: req.harness,
			model: req.workerModel,
			trialsPerCandidate: req.trials,
			provider: req.provider,
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
	if (req.design) parts.push(`--design ${req.design}`);
	if (req.grade) parts.push("--grade");
	return parts.join(" ");
}
