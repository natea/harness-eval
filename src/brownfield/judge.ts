/**
 * Judge-based secondary signal (task 5.2): does the candidate patch look like a
 * fix for the issue, judged blind to the merged PR? Judge ≠ worker is enforced
 * by the caller via `assertClassifierIndependent`.
 */
export const JUDGE_SYSTEM =
	"You are a strict senior Python reviewer. You see an issue report, the candidate's diff, and the human reference diff. Judge only whether the candidate addresses the reported behaviour; do not reward stylistic similarity to the reference.";

export interface JudgeInput {
	issueTitle: string;
	issueBody: string;
	referencePatch: string;
	candidatePatch: string;
}

export interface JudgeResult {
	resolvesIssue: boolean;
	quality: "good" | "partial" | "poor";
	notes: string;
	costUsd: number;
}

export type JudgeRunner = (args: {
	model: string;
	system: string;
	prompt: string;
	schema: object;
}) => Promise<{ structured: Record<string, unknown>; costUsd: number }>;

const MAX_PATCH = 12_000;
const clip = (s: string, n: number) =>
	s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} chars truncated)` : s;

export const JUDGE_SCHEMA = {
	type: "object",
	properties: {
		resolvesIssue: { type: "boolean" },
		quality: { type: "string", enum: ["good", "partial", "poor"] },
		notes: { type: "string" },
	},
	required: ["resolvesIssue", "quality", "notes"],
	additionalProperties: false,
} as const;

export function buildJudgePrompt(input: JudgeInput): string {
	return [
		`## Issue\n\n${input.issueTitle}\n\n${clip(input.issueBody, 6_000)}`,
		`## Candidate diff\n\n\`\`\`diff\n${clip(input.candidatePatch || "(empty diff)", MAX_PATCH)}\n\`\`\``,
		`## Human reference diff (context only)\n\n\`\`\`diff\n${clip(input.referencePatch || "(none)", MAX_PATCH)}\n\`\`\``,
	].join("\n\n");
}

export async function judgeCandidate(
	input: JudgeInput,
	opts: { model: string; runner?: JudgeRunner },
): Promise<JudgeResult> {
	const runner = opts.runner ?? anthropicApiJudgeRunner;
	const { structured, costUsd } = await runner({
		model: opts.model,
		system: JUDGE_SYSTEM,
		prompt: buildJudgePrompt(input),
		schema: JUDGE_SCHEMA,
	});
	const quality = String(structured.quality);
	if (!["good", "partial", "poor"].includes(quality))
		throw new Error(`judge returned an unknown quality '${quality}'`);
	return {
		resolvesIssue: structured.resolvesIssue === true,
		quality: quality as JudgeResult["quality"],
		notes: String(structured.notes ?? ""),
		costUsd,
	};
}

/** Judge via the Claude Code CLI with the API key (no operator login needed). */
export const anthropicApiJudgeRunner: JudgeRunner = async ({
	model,
	system,
	prompt,
	schema,
}) => {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
	const p = Bun.spawn(
		[
			"claude",
			"-p",
			"--model",
			model,
			"--tools",
			"",
			"--strict-mcp-config",
			"--setting-sources",
			"",
			"--system-prompt",
			system,
			"--output-format",
			"json",
			"--json-schema",
			JSON.stringify(schema),
		],
		{
			cwd: "/tmp",
			stdin: new TextEncoder().encode(prompt),
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				ANTHROPIC_API_KEY: key,
				CLAUDE_CODE_OAUTH_TOKEN: "",
			},
		},
	);
	const out = await new Response(p.stdout).text();
	const code = await p.exited;
	let res: Record<string, unknown>;
	try {
		res = JSON.parse(out || "{}");
	} catch {
		throw new Error(
			`judge returned non-JSON (exit ${code}): ${out.slice(0, 200)}`,
		);
	}
	if (code !== 0 || res.is_error || !res.structured_output)
		throw new Error(`judge failed (${code}): ${out.slice(0, 300)}`);
	return {
		structured: res.structured_output as Record<string, unknown>,
		costUsd: Number(res.total_cost_usd ?? 0),
	};
};
