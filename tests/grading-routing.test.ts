import { expect, test } from "bun:test";
import { ModelProfile } from "../src/models";
import { gradeDriversForJudge } from "../src/orchestrator/grade";

const localJudge = ModelProfile.parse({
	name: "local-judge",
	provider: "ollama",
	modelId: "llama3.1",
	transport: "openai-compat",
	baseUrl: "http://localhost:11434/v1",
	authKind: "none",
});

test("openai-compat judge routes code-quality through sdk without moving evaluator off cc", () => {
	expect(gradeDriversForJudge("cc", localJudge)).toEqual({
		evaluator: "cc",
		quality: "sdk",
	});
});

test("anthropic judge preserves the requested grading driver", () => {
	const anthropic = ModelProfile.parse({
		name: "claude-sonnet-4-6",
		provider: "anthropic",
		modelId: "claude-sonnet-4-6",
		transport: "claude-code",
		authEnv: "CLAUDE_CODE_OAUTH_TOKEN",
		authKind: "oauth",
	});
	expect(gradeDriversForJudge("sdk", anthropic)).toEqual({
		evaluator: "sdk",
		quality: "sdk",
	});
});
