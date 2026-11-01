/**
 * Gold-aware leak classifier (design D9, task 3.5).
 *
 * Labels the issue body and each retained comment by how much of the REFERENCE fix
 * it gives away. Runs through headless `claude -p` like the grader: subscription
 * OAuth (`CLAUDE_CODE_OAUTH_TOKEN`) with `ANTHROPIC_API_KEY` blanked, no tools, no
 * MCP, no settings, structured output. The output records the model and a hash of
 * the prompt, so labels are attributable and stale prompts are detectable.
 */
import {
	LEAK_LEVELS,
	type LeakLabels,
	type LeakLevel,
	type Snapshot,
	sha256,
} from "./bundle";

export const DEFAULT_LEAK_MODEL = "claude-sonnet-5-5";
const PATCH_MAX = 20_000;
const TEXT_MAX = 6_000;

export const LEAK_SYSTEM_PROMPT = `You audit benchmark tasks for solution leakage. A coding agent will be given a GitHub issue (and, in one condition, the discussion comments written before any fix work began) and asked to fix it in the repository. You are given the REFERENCE fix that was actually merged. For the issue body and each comment, decide how much of the reference fix the text gives away to a competent developer who has the repository but not the fix.

Labels (pick the highest that applies):
- noise: no technical content about the problem (thanks, +1, scheduling, "I'll look into it").
- symptom: observed behavior, reproduction steps, tracebacks, logs, versions, environment. A traceback that names the crashing function is still symptom. A wrong or unconfirmed guess at the cause is symptom.
- diagnosis: identifies the root cause or the specific code location/mechanism that the reference fix changes, beyond what the traceback alone shows.
- fix_sketch: describes the change to make, in prose or pseudocode, consistent with the reference fix.
- fix_code: contains code that is substantially the reference fix (would mostly solve it if pasted).

Judge only against the reference fix: a diagnosis or proposal that points somewhere the reference fix did not go is NOT a leak (label it symptom and set consistent_with_reference=false). Workarounds that avoid the bug without fixing it (e.g. "install a different package") are symptom unless they reveal the mechanism. Be strict and concrete; quote evidence verbatim. Return one item per input id, in order.`;

export const LEAK_SCHEMA = {
	type: "object",
	properties: {
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					label: { type: "string", enum: [...LEAK_LEVELS] },
					consistent_with_reference: { type: "boolean" },
					reveals_files: { type: "array", items: { type: "string" } },
					evidence: { type: "string" },
					rationale: { type: "string" },
				},
				required: [
					"id",
					"label",
					"consistent_with_reference",
					"reveals_files",
					"evidence",
					"rationale",
				],
			},
		},
	},
	required: ["items"],
} as const;

export class ClassifierIndependenceError extends Error {}

/** D9: the classifier must not be the worker model of any run that uses its labels. */
export function assertClassifierIndependent(
	classifierModel: string,
	workerModel: string,
): void {
	if (classifierModel === workerModel)
		throw new ClassifierIndependenceError(
			`leak labels were produced by ${classifierModel}, which is this run's worker model; regenerate them with a different model`,
		);
}

export function authorRole(
	c: { author: string; isBot: boolean; assoc?: string },
	issueAuthor: string,
	prAuthor: string,
): string {
	if (c.isBot) return "bot";
	if (c.author === prAuthor) return "future fixer (author of the reference PR)";
	if (c.author === issueAuthor) return "issue author";
	if (["OWNER", "MEMBER", "COLLABORATOR"].includes(c.assoc ?? ""))
		return "maintainer";
	return "other user";
}

const clip = (s: string, n: number) =>
	s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s;

export interface ClassifyInput {
	snapshot: Snapshot;
	referencePatch: string;
	prAuthor: string;
	model?: string;
}

export function buildPrompt(input: ClassifyInput): {
	prompt: string;
	items: { id: string; author: string; role: string }[];
} {
	const s = input.snapshot;
	const items = [
		{ id: "body", author: s.issueAuthor, role: "issue author", text: s.body },
		...s.comments.map((c, i) => ({
			id: `c${i + 1}`,
			author: c.author,
			role: authorRole(c, s.issueAuthor, input.prAuthor),
			text: c.text,
		})),
	];
	const prompt =
		`## Reference fix (merged PR, non-test files only)\n\n\`\`\`diff\n${clip(input.referencePatch || "(no non-test changes)", PATCH_MAX)}\n\`\`\`\n\n## Issue title\n\n${s.title}\n\n## Texts to label\n\n` +
		items
			.map(
				(it) =>
					`### id=${it.id} — @${it.author} (${it.role})\n\n${clip(it.text, TEXT_MAX)}\n`,
			)
			.join("\n");
	return {
		prompt,
		items: items.map(({ id, author, role }) => ({ id, author, role })),
	};
}

/** Runs one structured-output completion; injectable for tests. */
export type ClaudeRunner = (args: {
	model: string;
	system: string;
	prompt: string;
	schema: object;
}) => Promise<{ structured: { items: unknown[] }; costUsd: number }>;

export const claudeCliRunner: ClaudeRunner = async ({
	model,
	system,
	prompt,
	schema,
}) => {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
	if (!token) throw new Error("CLAUDE_CODE_OAUTH_TOKEN is not set (see .env)");
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
			// Claude Code prefers an API key over OAuth when both are set; blank it.
			env: {
				...process.env,
				ANTHROPIC_API_KEY: "",
				CLAUDE_CODE_OAUTH_TOKEN: token,
			},
		},
	);
	const out = await new Response(p.stdout).text();
	const code = await p.exited;
	const res = JSON.parse(out || "{}");
	if (code !== 0 || res.is_error || !res.structured_output)
		throw new Error(`claude -p failed (${code}): ${out.slice(0, 300)}`);
	return {
		structured: res.structured_output,
		costUsd: res.total_cost_usd ?? 0,
	};
};

export interface ClassifyResult extends LeakLabels {
	promptHash: string;
	costUsd: number;
}

export async function classifyLeaks(
	input: ClassifyInput,
	runner: ClaudeRunner = claudeCliRunner,
): Promise<ClassifyResult> {
	const model = input.model ?? DEFAULT_LEAK_MODEL;
	const { prompt, items } = buildPrompt(input);
	const { structured, costUsd } = await runner({
		model,
		system: LEAK_SYSTEM_PROMPT,
		prompt,
		schema: LEAK_SCHEMA,
	});
	const got = structured.items as LeakLabels["items"];
	const byId = new Map(got.map((g) => [g.id, g]));
	const missing = items.filter((i) => !byId.has(i.id)).map((i) => i.id);
	if (missing.length)
		throw new Error(`classifier skipped items: ${missing.join(", ")}`);
	const labeled = items.map((i) => ({
		...(byId.get(i.id) as LeakLabels["items"][number]),
		author: i.author,
		role: i.role,
	}));
	const rank = (l: LeakLevel) => LEAK_LEVELS.indexOf(l);
	const maxOf = (xs: typeof labeled) =>
		xs.reduce<LeakLevel>(
			(m, x) => (rank(x.label) > rank(m) ? x.label : m),
			"noise",
		);
	return {
		model,
		promptHash: sha256(LEAK_SYSTEM_PROMPT + JSON.stringify(LEAK_SCHEMA)),
		costUsd,
		bodyLevel: labeled.find((x) => x.id === "body")?.label,
		commentsLevel: maxOf(labeled.filter((x) => x.id !== "body")),
		items: labeled,
	};
}
