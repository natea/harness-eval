import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
	CRITERIA,
	judgeClientForProfile,
	judgeQuality,
	OpenAICompatJudgeClient,
	parseFallbackScore,
} from "../src/grading/judge";
import { ModelProfile } from "../src/models";

const FIRST_CRITERION = CRITERIA[0];
if (!FIRST_CRITERION)
	throw new Error("CRITERIA must include at least one item");

test("parseFallbackScore extracts score and justification from freeform text", () => {
	const parsed = parseFallbackScore(
		"Score: 7\nJustification: tests pass, but error handling is thin.",
	);
	expect(parsed).toEqual({
		score: 7,
		justification: "tests pass, but error handling is thin.",
		usedFallback: true,
	});
});

test("judgeQuality records fallback usage per sample", async () => {
	let i = 0;
	const quality = await judgeQuality({
		model: "local-judge",
		blindWorkspaceDir: "/tmp/no-real-workspace",
		samples: 1,
		judgeClient: {
			scoreCriterion: async () => ({
				score: ++i,
				justification: `sample ${i}`,
				usedFallback: i % 2 === 0,
			}),
		},
	});

	expect(quality.criteria).toHaveLength(CRITERIA.length);
	expect(quality.criteria[0]?.samples).toEqual([1]);
	expect(quality.criteria[0]?.sampleDetails).toEqual([
		{ score: 1, justification: "sample 1", usedFallback: false },
	]);
	expect(quality.criteria[1]?.sampleDetails?.[0]?.usedFallback).toBe(true);
});

test("OpenAICompatJudgeClient reads record_score tool calls", async () => {
	const requests: unknown[] = [];
	const client = {
		chat: {
			completions: {
				create: async (request: unknown) => {
					requests.push(request);
					return {
						choices: [
							{
								message: {
									tool_calls: [
										{
											id: "call-1",
											type: "function",
											function: {
												name: "record_score",
												arguments: JSON.stringify({
													score: 8,
													justification: "solid evidence",
												}),
											},
										},
									],
								},
							},
						],
					};
				},
			},
		},
	};

	const sample = await new OpenAICompatJudgeClient(
		client as never,
	).scoreCriterion(
		{
			model: "local-judge",
			blindWorkspaceDir: "/tmp/no-real-workspace",
			maxIterationsPerSample: 1,
		},
		FIRST_CRITERION,
	);

	expect(sample).toEqual({
		score: 8,
		justification: "solid evidence",
		usedFallback: false,
	});
	expect(JSON.stringify(requests[0])).toContain("record_score");
});

test("OpenAICompatJudgeClient prompts with an absolute workspace path", async () => {
	let request: Record<string, unknown> | null = null;
	const client = {
		chat: {
			completions: {
				create: async (body: Record<string, unknown>) => {
					request = body;
					return {
						choices: [
							{
								message: {
									content: "Score: 6\nJustification: inspected workspace.",
								},
							},
						],
					};
				},
			},
		},
	};

	await new OpenAICompatJudgeClient(client as never).scoreCriterion(
		{
			model: "local-judge",
			blindWorkspaceDir: "runs/example/workspace-blind",
			maxIterationsPerSample: 1,
		},
		FIRST_CRITERION,
	);

	expect(JSON.stringify(request)).toContain(
		`Workspace: ${resolve("runs/example/workspace-blind")}`,
	);
});

test("OpenAICompatJudgeClient falls back to parseable text", async () => {
	const client = {
		chat: {
			completions: {
				create: async () => ({
					choices: [
						{
							message: {
								content: "Score: 6\nJustification: useful but incomplete.",
							},
						},
					],
				}),
			},
		},
	};

	const sample = await new OpenAICompatJudgeClient(
		client as never,
	).scoreCriterion(
		{
			model: "local-judge",
			blindWorkspaceDir: "/tmp/no-real-workspace",
			maxIterationsPerSample: 1,
		},
		FIRST_CRITERION,
	);

	expect(sample).toEqual({
		score: 6,
		justification: "useful but incomplete.",
		usedFallback: true,
	});
});

test("OpenAICompatJudgeClient falls back to Ollama reasoning text", async () => {
	const client = {
		chat: {
			completions: {
				create: async () => ({
					choices: [
						{
							message: {
								content: "",
								reasoning:
									"Final Check\nScore: 5\nJustification: unable to inspect workspace.",
							},
						},
					],
				}),
			},
		},
	};

	const sample = await new OpenAICompatJudgeClient(
		client as never,
	).scoreCriterion(
		{
			model: "local-judge",
			blindWorkspaceDir: "/tmp/no-real-workspace",
			maxIterationsPerSample: 1,
		},
		FIRST_CRITERION,
	);

	expect(sample).toEqual({
		score: 5,
		justification: "unable to inspect workspace.",
		usedFallback: true,
	});
});

test("judgeClientForProfile selects openai-compat for local judge profiles", async () => {
	const profile = ModelProfile.parse({
		name: "local-judge",
		provider: "ollama",
		modelId: "llama3.1",
		transport: "openai-compat",
		baseUrl: "http://localhost:11434/v1",
		authKind: "none",
	});
	const client = judgeClientForProfile(
		profile,
		{},
		{
			openAIClient: {
				chat: {
					completions: {
						create: async () => ({
							choices: [
								{
									message: {
										content: "Score: 5\nJustification: local judge response.",
									},
								},
							],
						}),
					},
				},
			} as never,
		},
	);

	const sample = await client.scoreCriterion(
		{
			model: "llama3.1",
			blindWorkspaceDir: "/tmp/no-real-workspace",
			maxIterationsPerSample: 1,
		},
		FIRST_CRITERION,
	);
	expect(sample.usedFallback).toBe(true);
	expect(sample.score).toBe(5);
});
