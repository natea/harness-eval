import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
	ModelError,
	type ModelProfile,
	resolveOpenAICompatEnv,
} from "../models";
import type {
	CriterionSample,
	CriterionScore,
	QualityCriterion,
	QualityResult,
} from "../types";

const execFileAsync = promisify(execFile);

export const CRITERIA: { key: QualityCriterion; prompt: string }[] = [
	{
		key: "tests",
		prompt:
			"Are the tests meaningful and passing? Run the artifact's own test suite and weigh observed results heavily: coverage of core behaviors, assertions that would actually catch regressions, no trivially-green tests.",
	},
	{
		key: "architecture",
		prompt:
			"Does the structure match the layered architecture in SPEC-REFERENCE.md §3.2 (policy/config/coordination/execution/integration/observability)? Are boundaries clean and dependencies pointed the right way?",
	},
	{
		key: "errorHandling",
		prompt:
			"Is error handling robust? Typed errors where the spec requires, no swallowed failures, retries/timeouts where external calls occur, crash-safety in the daemon loop.",
	},
	{
		key: "deadCode",
		prompt:
			"Is the codebase free of dead code, duplicated logic, vestigial scaffolding, and unused dependencies?",
	},
	{
		key: "documentation",
		prompt:
			"Is documentation adequate? README/setup accuracy, WORKFLOW.md contract documented, non-obvious decisions explained where they matter.",
	},
];

const JUDGE_SYSTEM = `You are a senior engineer reviewing an anonymous codebase that implements a daemon service against the specification provided at SPEC-REFERENCE.md in the workspace.

Score ONE criterion from 0-10. Base your score on evidence: run commands (tests, linters, type checkers, grep) and cite what you observed. Do not assume; verify. Do not attempt to identify who or what produced the code — judge the artifact only. NEVER modify the artifact.

When done, call record_score exactly once with {score: 0-10, justification: "<evidence-citing rationale>"}.`;

function resolvedWorkspace(opts: Pick<JudgeOptions, "blindWorkspaceDir">): string {
	return resolve(opts.blindWorkspaceDir);
}

export interface JudgeOptions {
	model: string;
	blindWorkspaceDir: string;
	samples?: number;
	maxIterationsPerSample?: number;
	apiKey?: string;
	/** Called after each criterion is scored — checkpoint hook. */
	onCriterion?: (c: CriterionScore) => void;
	/** Criteria already scored in a prior interrupted run. */
	preScored?: CriterionScore[];
	client?: Anthropic;
	judgeProfile?: ModelProfile;
	openAIClient?: OpenAICompatChatClient;
	judgeClient?: JudgeClient;
}

export interface JudgeClient {
	scoreCriterion(
		opts: JudgeOptions,
		criterion: (typeof CRITERIA)[number],
	): Promise<CriterionSample>;
}

interface OpenAICompatChatClient {
	chat: {
		completions: {
			create: (request: Record<string, unknown>) => Promise<{
				choices?: {
					message?: {
						content?: string | null;
						reasoning?: string | null;
						tool_calls?: {
							id: string;
							type?: string;
							function?: { name?: string; arguments?: string };
						}[];
					};
				}[];
			}>;
		};
	};
}

export function judgeClientForProfile(
	profile: ModelProfile,
	lookup: NodeJS.ProcessEnv = process.env,
	deps: {
		anthropicClient?: Anthropic;
		openAIClient?: OpenAICompatChatClient;
	} = {},
): JudgeClient {
	if (profile.transport === "openai-compat") {
		if (deps.openAIClient)
			return new OpenAICompatJudgeClient(deps.openAIClient);
		return OpenAICompatJudgeClient.fromEndpoint(
			resolveOpenAICompatEnv(profile, lookup),
		);
	}
	if (profile.transport === "codex") {
		throw new ModelError(
			`profile '${profile.name}' uses Codex transport, which cannot judge directly`,
		);
	}
	return new AnthropicJudgeClient(
		deps.anthropicClient ??
			new Anthropic({ apiKey: lookup[profile.authEnv ?? "ANTHROPIC_API_KEY"] }),
	);
}

export function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function parseFallbackScore(text: string): CriterionSample | null {
	const scoreMatch = text.match(/\bscore\b\s*[:=-]?\s*(10|[0-9])(?:\.\d+)?/i);
	if (!scoreMatch) return null;
	const score = Math.max(0, Math.min(10, Number(scoreMatch[1])));
	const justificationMatch = text.match(
		/\bjustification\b\s*[:=-]\s*([\s\S]+)/i,
	);
	const justification = (justificationMatch?.[1] ?? text).trim();
	if (!justification) return null;
	return { score, justification, usedFallback: true };
}

async function judgeOneAnthropicSample(
	client: Anthropic,
	opts: JudgeOptions,
	criterion: (typeof CRITERIA)[number],
): Promise<CriterionSample> {
	const workspace = resolvedWorkspace(opts);
	const messages: Anthropic.MessageParam[] = [
		{
			role: "user",
			content: `Criterion: ${criterion.prompt}\nWorkspace: ${workspace}\nShell commands run with this workspace as the current directory.`,
		},
	];
	const tools: Anthropic.Tool[] = [
		{
			name: "bash",
			description: "Run a shell command in the workspace (read-only intent).",
			input_schema: {
				type: "object",
				properties: { command: { type: "string" } },
				required: ["command"],
			},
		},
		{
			name: "record_score",
			description: "Record the criterion score. Call exactly once, then stop.",
			input_schema: {
				type: "object",
				properties: {
					score: { type: "number", minimum: 0, maximum: 10 },
					justification: { type: "string" },
				},
				required: ["score", "justification"],
			},
		},
	];

	const maxIterations = opts.maxIterationsPerSample ?? 25;
	for (let i = 0; i < maxIterations; i++) {
		const response = await client.messages.create({
			model: opts.model,
			max_tokens: 2048,
			temperature: 0,
			system: JUDGE_SYSTEM,
			messages,
			tools,
		});
		messages.push({ role: "assistant", content: response.content });
		const text = response.content
			.filter((b): b is Anthropic.TextBlock => b.type === "text")
			.map((b) => b.text)
			.join("\n");
		const toolUses = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
		);
		if (toolUses.length === 0) {
			const fallback = parseFallbackScore(text);
			if (fallback) return fallback;
			break;
		}
		const results: Anthropic.ToolResultBlockParam[] = [];
		for (const use of toolUses) {
			if (use.name === "record_score") {
				const input = use.input as { score: number; justification: string };
				return {
					score: Math.max(0, Math.min(10, Number(input.score))),
					justification: String(input.justification),
					usedFallback: false,
				};
			}
			const input = use.input as { command: string };
			let output: string;
			try {
				const { stdout, stderr } = await execFileAsync(
					"bash",
					["-c", input.command],
					{
						cwd: workspace,
						timeout: 120_000,
						maxBuffer: 8 * 1024 * 1024,
					},
				);
				output = `exit 0\n${stdout.slice(0, 12000)}\n${stderr.slice(0, 3000)}`;
			} catch (err) {
				const e = err as {
					code?: number | string;
					stdout?: string;
					stderr?: string;
				};
				output = `exit ${e.code ?? "error"}\n${(e.stdout ?? "").slice(0, 12000)}\n${(e.stderr ?? String(err)).slice(0, 3000)}`;
			}
			results.push({
				type: "tool_result",
				tool_use_id: use.id,
				content: output,
			});
		}
		messages.push({ role: "user", content: results });
	}
	throw new Error("judge did not record a score within iteration budget");
}

class AnthropicJudgeClient implements JudgeClient {
	constructor(private readonly client: Anthropic) {}

	scoreCriterion(
		opts: JudgeOptions,
		criterion: (typeof CRITERIA)[number],
	): Promise<CriterionSample> {
		return judgeOneAnthropicSample(this.client, opts, criterion);
	}
}

async function runJudgeBash(
	command: string,
	workspaceDir: string,
): Promise<string> {
	try {
		const { stdout, stderr } = await execFileAsync("bash", ["-c", command], {
			cwd: workspaceDir,
			timeout: 120_000,
			maxBuffer: 8 * 1024 * 1024,
		});
		return `exit 0\n${stdout.slice(0, 12000)}\n${stderr.slice(0, 3000)}`;
	} catch (err) {
		const e = err as {
			code?: number | string;
			stdout?: string;
			stderr?: string;
		};
		return `exit ${e.code ?? "error"}\n${(e.stdout ?? "").slice(0, 12000)}\n${(e.stderr ?? String(err)).slice(0, 3000)}`;
	}
}

export class OpenAICompatJudgeClient implements JudgeClient {
	constructor(private readonly client: OpenAICompatChatClient) {}

	static fromEndpoint(opts: {
		baseUrl: string;
	}): OpenAICompatJudgeClient {
		return new OpenAICompatJudgeClient(
			new OpenAI({
				baseURL: opts.baseUrl,
				apiKey: "not-needed",
			}) as unknown as OpenAICompatChatClient,
		);
	}

	async scoreCriterion(
		opts: JudgeOptions,
		criterion: (typeof CRITERIA)[number],
	): Promise<CriterionSample> {
		const workspace = resolvedWorkspace(opts);
		const messages: Record<string, unknown>[] = [
			{ role: "system", content: JUDGE_SYSTEM },
			{
				role: "user",
				content: `Criterion: ${criterion.prompt}\nWorkspace: ${workspace}\nShell commands run with this workspace as the current directory.`,
			},
		];
		const tools = [
			{
				type: "function",
				function: {
					name: "bash",
					description:
						"Run a shell command in the workspace (read-only intent).",
					parameters: {
						type: "object",
						properties: { command: { type: "string" } },
						required: ["command"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "record_score",
					description:
						"Record the criterion score. Call exactly once, then stop.",
					parameters: {
						type: "object",
						properties: {
							score: { type: "number", minimum: 0, maximum: 10 },
							justification: { type: "string" },
						},
						required: ["score", "justification"],
					},
				},
			},
		];

		const maxIterations = opts.maxIterationsPerSample ?? 25;
		for (let i = 0; i < maxIterations; i++) {
			const response = await this.client.chat.completions.create({
				model: opts.model,
				temperature: 0,
				messages,
				tools,
			});
			const message = response.choices?.[0]?.message ?? {};
			const toolCalls = message.tool_calls ?? [];
			messages.push({ role: "assistant", ...message });
			if (toolCalls.length === 0) {
				const fallback = parseFallbackScore(
					[String(message.content ?? ""), String(message.reasoning ?? "")]
						.filter(Boolean)
						.join("\n"),
				);
				if (fallback) return fallback;
				break;
			}

			for (const call of toolCalls) {
				const name = call.function?.name ?? "";
				const rawArgs = call.function?.arguments ?? "{}";
				const args = JSON.parse(rawArgs) as Record<string, unknown>;
				if (name === "record_score") {
					return {
						score: Math.max(0, Math.min(10, Number(args.score))),
						justification: String(args.justification ?? ""),
						usedFallback: false,
					};
				}
				if (name === "bash") {
					const output = await runJudgeBash(
						String(args.command ?? ""),
						workspace,
					);
					messages.push({
						role: "tool",
						tool_call_id: call.id,
						content: output,
					});
				}
			}
		}

		throw new Error("judge did not record a score within iteration budget");
	}
}

/**
 * Code-quality judge (task 6.5): pinned non-worker model, temperature 0,
 * tool access, 3 independent samples per criterion, median taken
 * (grading-rubric spec). Operates only on the scrubbed blind workspace.
 */
export async function judgeQuality(opts: JudgeOptions): Promise<QualityResult> {
	const client =
		opts.judgeClient ??
		(opts.judgeProfile
			? judgeClientForProfile(opts.judgeProfile, process.env, {
					anthropicClient: opts.client,
					openAIClient: opts.openAIClient,
				})
			: undefined) ??
		new AnthropicJudgeClient(
			opts.client ??
				new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY }),
		);
	const samples = opts.samples ?? 3;
	const criteria: CriterionScore[] = [...(opts.preScored ?? [])];
	const done = new Set(criteria.map((c) => c.criterion));
	for (const criterion of CRITERIA) {
		if (done.has(criterion.key)) continue;
		const runs: CriterionSample[] = [];
		for (let s = 0; s < samples; s++) {
			runs.push(await client.scoreCriterion(opts, criterion));
		}
		const scores = runs.map((r) => r.score);
		const med = median(scores);
		const medianRun = runs.find((r) => r.score === med) ?? runs[0];
		const scored: CriterionScore = {
			criterion: criterion.key,
			samples: scores,
			sampleDetails: runs,
			score: med,
			justification: medianRun?.justification ?? "",
		};
		criteria.push(scored);
		opts.onCriterion?.(scored);
	}
	const mean = criteria.reduce((a, c) => a + c.score, 0) / criteria.length;
	return {
		judgeModel: opts.model,
		criteria,
		score: Math.round(mean * 10 * 100) / 100, // 0-10 mean → 0-100
	};
}
