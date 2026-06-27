import { describe, expect, test } from "bun:test";
import {
	classifyCostSource,
	judgeWorkerRelation,
	loadModels,
	ModelError,
	ModelProfile,
	priceFromTokens,
	resolveClaudeCodeEnv,
	resolveOpenAICompatEnv,
	resolveProfile,
	resolveWorkerEnv,
} from "../src/models";

describe("model registry (add-pluggable-models)", () => {
	test("config/models.yaml loads and contains the documented profiles", () => {
		const reg = loadModels();
		expect(reg.get("claude-opus-4-6")?.provider).toBe("anthropic");
		expect(reg.get("glm-4.7")?.provider).toBe("z.ai");
		expect(reg.get("glm-4.7")?.baseUrl).toContain("z.ai");
	});

	test("bare claude-* id resolves to an implicit native profile", () => {
		const reg = loadModels();
		const p = resolveProfile("claude-opus-4-7", reg); // not in yaml
		expect(p.provider).toBe("anthropic");
		expect(p.transport).toBe("claude-code");
		expect(p.authKind).toBe("oauth");
		expect(p.modelId).toBe("claude-opus-4-7");
	});

	test("unknown non-claude reference fails fast", () => {
		const reg = loadModels();
		expect(() => resolveProfile("llama-9000", reg)).toThrow(ModelError);
		expect(() => resolveProfile("llama-9000", reg)).toThrow(/declared in/);
	});

	test("judge≠worker enforced; cross-vendor flagged", () => {
		const reg = loadModels();
		const opus = resolveProfile("claude-opus-4-6", reg);
		const sonnet = resolveProfile("claude-sonnet-4-6", reg);
		const glm = resolveProfile("glm-4.7", reg);
		// same profile both sides → self-grading disallowed
		expect(() => judgeWorkerRelation(opus, opus)).toThrow(/self-grading/);
		// same vendor, different models → ok, not cross-vendor
		expect(judgeWorkerRelation(opus, sonnet).crossVendor).toBe(false);
		// different vendors → cross-vendor caveat
		expect(judgeWorkerRelation(glm, sonnet).crossVendor).toBe(true);
	});

	test("resolveClaudeCodeEnv injects per auth kind and blanks the API key", () => {
		const reg = loadModels();
		const lookup = {
			CLAUDE_CODE_OAUTH_TOKEN: "oauth-tok",
			ZAI_API_KEY: "zai-tok",
		} as NodeJS.ProcessEnv;

		const native = resolveClaudeCodeEnv(
			resolveProfile("claude-opus-4-6", reg),
			lookup,
		);
		expect(native.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-tok");
		expect(native.env.ANTHROPIC_API_KEY).toBe("");
		expect(native.modelFlag).toBe("claude-opus-4-6");

		const glm = resolveClaudeCodeEnv(resolveProfile("glm-4.7", reg), lookup);
		expect(glm.env.ANTHROPIC_AUTH_TOKEN).toBe("zai-tok");
		expect(glm.env.ANTHROPIC_BASE_URL).toContain("z.ai");
		expect(glm.env.ANTHROPIC_API_KEY).toBe("");
		expect(glm.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(""); // stray ambient token blanked
		// z.ai maps Claude slots → GLM via env; worker runs the opus slot.
		expect(glm.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("glm-4.7");
		expect(glm.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("glm-4.7");
		expect(glm.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("glm-4.7");
		expect(glm.env.API_TIMEOUT_MS).toBe("3000000");
		expect(glm.modelFlag).toBe("opus");
	});

	test("resolveClaudeCodeEnv errors when the auth env var is unset", () => {
		const reg = loadModels();
		expect(() =>
			resolveClaudeCodeEnv(
				resolveProfile("glm-4.7", reg),
				{} as NodeJS.ProcessEnv,
			),
		).toThrow(/ZAI_API_KEY is not set/);
	});

	test("priceFromTokens uses profile pricing; null when absent", () => {
		const reg = loadModels();
		// none of the shipped profiles declare pricing yet
		expect(
			priceFromTokens(resolveProfile("glm-4.7", reg), 1_000_000, 1_000_000),
		).toBeNull();
		// a synthetic priced profile
		const priced = {
			...resolveProfile("glm-4.7", reg),
			pricing: { inputPerMtokUsd: 0.6, outputPerMtokUsd: 2.2 },
		};
		expect(priceFromTokens(priced, 1_000_000, 1_000_000)).toBeCloseTo(2.8, 6);
	});

	test("classifyCostSource picks the right source (task 2.3)", () => {
		const reg = loadModels();
		const opus = resolveProfile("claude-opus-4-6", reg);
		const glm = resolveProfile("glm-4.7", reg); // no pricing in yaml
		const glmPriced = {
			...glm,
			pricing: { inputPerMtokUsd: 0.6, outputPerMtokUsd: 2.2 },
		};

		// Native Anthropic + harness dollars → harness-reported.
		expect(classifyCostSource(opus, 0.42, 1000, 500)).toEqual({
			costUsd: 0.42,
			source: "harness-reported",
		});
		// Third-party: harness USD is Anthropic-priced, so ignore it; use pricing.
		const priced = classifyCostSource(glmPriced, 0.42, 1_000_000, 1_000_000);
		expect(priced.source).toBe("profile-priced");
		expect(priced.costUsd).toBeCloseTo(2.8, 6);
		// Third-party, no pricing → tokens-only, no dollar figure.
		expect(classifyCostSource(glm, 0.42, 1_000_000, 1_000_000)).toEqual({
			costUsd: null,
			source: "tokens-only",
		});
	});

	test("loader rejects auth-token profile without a baseUrl", () => {
		// resolveProfile builds implicit ones; here exercise the schema refine via
		// a direct parse path by loading is not possible, so assert the rule holds
		// through resolveClaudeCodeEnv on a hand-built profile is covered above;
		// the schema refine is unit-checked here:
		const bad = {
			name: "bad",
			provider: "x",
			modelId: "x",
			transport: "claude-code",
			authEnv: "X_KEY",
			authKind: "auth-token",
		};
		// loadModels validates file profiles; emulate by importing the schema:
		const { ModelProfile } = require("../src/models");
		expect(ModelProfile.safeParse(bad).success).toBe(false);
	});

	test("authKind none parses without authEnv and non-none auth requires authEnv", () => {
		const local = ModelProfile.parse({
			name: "local-x",
			provider: "ollama",
			modelId: "qwen3-coder",
			transport: "codex",
			authKind: "none",
		});
		expect(local.authEnv).toBeUndefined();

		const missingKey = ModelProfile.safeParse({
			name: "needs-key",
			provider: "openai",
			modelId: "gpt-5-codex",
			transport: "codex",
			authKind: "api-key",
		});
		expect(missingKey.success).toBe(false);
	});

	test("ossProvider requires codex transport and authKind none", () => {
		const ok = ModelProfile.safeParse({
			name: "ollama-x",
			provider: "ollama",
			modelId: "qwen3-coder",
			transport: "codex",
			authKind: "none",
			ossProvider: "ollama",
		});
		expect(ok.success).toBe(true);

		const badTransport = ModelProfile.safeParse({
			name: "bad1",
			provider: "ollama",
			modelId: "m",
			transport: "anthropic-sdk",
			authKind: "none",
			ossProvider: "ollama",
		});
		expect(badTransport.success).toBe(false);

		const badAuth = ModelProfile.safeParse({
			name: "bad2",
			provider: "ollama",
			modelId: "m",
			transport: "codex",
			authKind: "api-key",
			authEnv: "K",
			ossProvider: "ollama",
		});
		expect(badAuth.success).toBe(false);
	});

	test("resolveWorkerEnv returns ossProvider and no auth env for a local profile", () => {
		const p = ModelProfile.parse({
			name: "ollama-x",
			provider: "ollama",
			modelId: "qwen3-coder",
			transport: "codex",
			authKind: "none",
			ossProvider: "ollama",
		});

		const rw = resolveWorkerEnv(p, {});
		expect(rw.ossProvider).toBe("ollama");
		expect(rw.modelFlag).toBe("qwen3-coder");
		expect(rw.env).toEqual({});
		expect(rw.note).toContain("ollama");
	});

	test("openai-compat profiles resolve local baseUrl without auth", () => {
		const local = ModelProfile.parse({
			name: "local-judge",
			provider: "ollama",
			modelId: "llama3.1",
			transport: "openai-compat",
			baseUrl: "http://localhost:11434/v1",
			authKind: "none",
		});
		expect(resolveOpenAICompatEnv(local, {})).toEqual({
			baseUrl: "http://localhost:11434/v1",
		});
	});

	test("openai-compat requires baseUrl and rejects credentialed profiles", () => {
		expect(
			ModelProfile.safeParse({
				name: "bad-openai",
				provider: "ollama",
				modelId: "m",
				transport: "openai-compat",
				authKind: "none",
			}).success,
		).toBe(false);

		expect(
			ModelProfile.safeParse({
				name: "bad-openai-auth",
				provider: "ollama",
				modelId: "m",
				transport: "openai-compat",
				baseUrl: "http://localhost:11434/v1",
				authEnv: "TOKEN",
				authKind: "oauth",
			}).success,
		).toBe(false);

		expect(
			ModelProfile.safeParse({
				name: "bad-openai-remote",
				provider: "remote-openai-compatible",
				modelId: "remote-model",
				transport: "openai-compat",
				baseUrl: "https://models.example.com/v1",
				authEnv: "REMOTE_TOKEN",
				authKind: "api-key",
			}).success,
		).toBe(false);
	});

	test("local openai-compat judge versus cloud worker is cross-vendor", () => {
		const reg = loadModels();
		const worker = resolveProfile("claude-opus-4-6", reg);
		const judge = ModelProfile.parse({
			name: "local-judge",
			provider: "ollama",
			modelId: "llama3.1",
			transport: "openai-compat",
			baseUrl: "http://localhost:11434/v1",
			authKind: "none",
		});
		expect(judgeWorkerRelation(worker, judge).crossVendor).toBe(true);
	});
});
