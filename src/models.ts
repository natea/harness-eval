import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Model-provider registry (model-registry capability). A profile names a worker
 * or judge model and everything needed to drive it: which transport carries the
 * call, which endpoint, which env var holds the credential and how to inject it,
 * and optional pricing for cost estimation when the harness reports tokens only.
 */

export const ModelTransport = z.enum(["claude-code", "anthropic-sdk"]);
export type ModelTransport = z.infer<typeof ModelTransport>;

/**
 * How the profile's credential is injected:
 *  - `oauth`       → CLAUDE_CODE_OAUTH_TOKEN (native Anthropic via Claude Code / Max)
 *  - `auth-token`  → ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (z.ai-style
 *                    Anthropic-compatible coding endpoints driven through Claude Code)
 *  - `api-key`     → ANTHROPIC_API_KEY (+ optional baseURL) for direct SDK calls
 */
export const AuthKind = z.enum(["oauth", "auth-token", "api-key"]);
export type AuthKind = z.infer<typeof AuthKind>;

export const ModelPricing = z.object({
	inputPerMtokUsd: z.number().nonnegative(),
	outputPerMtokUsd: z.number().nonnegative(),
});
export type ModelPricing = z.infer<typeof ModelPricing>;

export const ModelProfile = z
	.object({
		name: z.string().regex(/^[a-z0-9.-]+$/),
		/** Vendor label used for cross-vendor judge detection and provenance. */
		provider: z.string().min(1),
		/** The value passed as the model flag / SDK model id. */
		modelId: z.string().min(1),
		transport: ModelTransport,
		/** ANTHROPIC_BASE_URL for third-party Anthropic-compatible endpoints. */
		baseUrl: z.string().url().optional(),
		/** Env var name holding the credential (never the value). */
		authEnv: z.string().min(1),
		authKind: AuthKind,
		/** Optional $/Mtok pricing for token-only providers. */
		pricing: ModelPricing.optional(),
	})
	.refine((p) => !(p.authKind === "auth-token" && !p.baseUrl), {
		message:
			"auth-token profiles require a baseUrl (third-party Anthropic-compatible endpoint)",
	});
export type ModelProfile = z.infer<typeof ModelProfile>;

export class ModelError extends Error {}

export type ModelRegistry = Map<string, ModelProfile>;

/** Load and validate `config/models.yaml`. Missing file → empty registry. */
export function loadModels(path = "config/models.yaml"): ModelRegistry {
	const map: ModelRegistry = new Map();
	if (!existsSync(path)) return map;
	const raw = parse(readFileSync(path, "utf8")) as {
		profiles?: unknown[];
	} | null;
	const profiles = raw?.profiles ?? [];
	profiles.forEach((p, i) => {
		const parsed = ModelProfile.safeParse(p);
		if (!parsed.success) {
			const issues = parsed.error.issues
				.map((x) => `  ${x.path.join(".")}: ${x.message}`)
				.join("\n");
			throw new ModelError(`invalid model profile #${i} in ${path}:\n${issues}`);
		}
		if (map.has(parsed.data.name)) {
			throw new ModelError(`duplicate model profile '${parsed.data.name}'`);
		}
		map.set(parsed.data.name, parsed.data);
	});
	return map;
}

/**
 * Resolve a run-config reference (`workerModel: glm-4.7` or a bare model id) to
 * a profile. A bare `claude-*` id with no explicit profile resolves to an
 * implicit native-Anthropic profile so existing runs keep working unchanged.
 */
export function resolveProfile(
	ref: string,
	registry: ModelRegistry,
): ModelProfile {
	const explicit = registry.get(ref);
	if (explicit) return explicit;
	if (/^claude-/.test(ref)) {
		return ModelProfile.parse({
			name: ref,
			provider: "anthropic",
			modelId: ref,
			transport: "claude-code",
			authEnv: "CLAUDE_CODE_OAUTH_TOKEN",
			authKind: "oauth",
		});
	}
	const known = [...registry.keys()].join(", ") || "none";
	throw new ModelError(
		`unknown model profile '${ref}' (known: ${known}) — non-claude models must be declared in config/models.yaml`,
	);
}

export interface ResolvedEnv {
	/** Env to merge into the sandbox/session (the only secret that enters). */
	env: Record<string, string>;
	/** Value for the harness `--model` flag. */
	modelFlag: string;
}

/**
 * Build the Claude-Code env for a worker/judge profile. ANTHROPIC_API_KEY is
 * blanked unless the profile explicitly uses it, so a stray API key never
 * silently bills (the hard-won worker-auth rule), and base-url/auth-token are
 * set for third-party endpoints.
 */
export function resolveClaudeCodeEnv(
	p: ModelProfile,
	lookup: NodeJS.ProcessEnv = process.env,
): ResolvedEnv {
	if (p.transport !== "claude-code") {
		throw new ModelError(
			`profile '${p.name}' is ${p.transport}, not a Claude Code worker profile`,
		);
	}
	const token = lookup[p.authEnv];
	if (!token) {
		throw new ModelError(
			`${p.authEnv} is not set (required by model profile '${p.name}')`,
		);
	}
	// Blank every auth var first, then set only the ones this profile uses, so a
	// stray ambient credential (e.g. CLAUDE_CODE_OAUTH_TOKEN) can't override a
	// third-party endpoint when this env is spread over process.env.
	const env: Record<string, string> = {
		ANTHROPIC_API_KEY: "",
		ANTHROPIC_AUTH_TOKEN: "",
		ANTHROPIC_BASE_URL: "",
		CLAUDE_CODE_OAUTH_TOKEN: "",
	};
	if (p.authKind === "oauth") {
		env.CLAUDE_CODE_OAUTH_TOKEN = token;
		return { env, modelFlag: p.modelId };
	}
	if (p.authKind === "auth-token") {
		// z.ai-style Anthropic-compatible endpoints don't take a raw `--model
		// glm-*`; Claude Code selects a slot (opus/sonnet/haiku) and the
		// ANTHROPIC_DEFAULT_*_MODEL env vars map that slot to the GLM model. Pin
		// all three slots to the profile model so the worker IS that model
		// regardless of which slot Claude Code or its subagents pick. GLM is slow
		// to first token, so widen the request timeout (z.ai's documented value).
		env.ANTHROPIC_AUTH_TOKEN = token;
		if (p.baseUrl) env.ANTHROPIC_BASE_URL = p.baseUrl;
		env.ANTHROPIC_DEFAULT_OPUS_MODEL = p.modelId;
		env.ANTHROPIC_DEFAULT_SONNET_MODEL = p.modelId;
		env.ANTHROPIC_DEFAULT_HAIKU_MODEL = p.modelId;
		env.API_TIMEOUT_MS = "3000000";
		// Drive Claude Code via the opus slot, which we've mapped to the model.
		return { env, modelFlag: "opus" };
	}
	// Direct API key (SDK/native baseURL override).
	env.ANTHROPIC_API_KEY = token;
	if (p.baseUrl) env.ANTHROPIC_BASE_URL = p.baseUrl;
	return { env, modelFlag: p.modelId };
}

/**
 * Judge-validity guardrail: the judge profile must differ from the worker
 * profile (self-grading is disallowed). Cross-vendor judging is allowed but
 * flagged so provenance/scorecards can carry a bias caveat.
 */
export function judgeWorkerRelation(
	worker: ModelProfile,
	judge: ModelProfile,
): { crossVendor: boolean } {
	if (worker.name === judge.name) {
		throw new ModelError(
			`judge profile must differ from worker profile (both '${worker.name}') — self-grading is disallowed`,
		);
	}
	return { crossVendor: worker.provider !== judge.provider };
}

/** Estimate USD from token counts when the harness reports tokens only. */
export function priceFromTokens(
	p: ModelProfile,
	inputTokens: number,
	outputTokens: number,
): number | null {
	if (!p.pricing) return null;
	return (
		(inputTokens / 1_000_000) * p.pricing.inputPerMtokUsd +
		(outputTokens / 1_000_000) * p.pricing.outputPerMtokUsd
	);
}
