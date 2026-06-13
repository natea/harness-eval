import { describe, expect, test } from "bun:test";
import {
	judgeWorkerRelation,
	loadModels,
	ModelError,
	priceFromTokens,
	resolveClaudeCodeEnv,
	resolveProfile,
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

		const native = resolveClaudeCodeEnv(resolveProfile("claude-opus-4-6", reg), lookup);
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
			resolveClaudeCodeEnv(resolveProfile("glm-4.7", reg), {} as NodeJS.ProcessEnv),
		).toThrow(/ZAI_API_KEY is not set/);
	});

	test("priceFromTokens uses profile pricing; null when absent", () => {
		const reg = loadModels();
		// none of the shipped profiles declare pricing yet
		expect(priceFromTokens(resolveProfile("glm-4.7", reg), 1_000_000, 1_000_000)).toBeNull();
		// a synthetic priced profile
		const priced = {
			...resolveProfile("glm-4.7", reg),
			pricing: { inputPerMtokUsd: 0.6, outputPerMtokUsd: 2.2 },
		};
		expect(priceFromTokens(priced, 1_000_000, 1_000_000)).toBeCloseTo(2.8, 6);
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
});
