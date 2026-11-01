/**
 * Agent invocation with a per-bundle spend cap (add-task-curation-collective 1.2, D8).
 * Calls go through the D9 headless `claude -p` runner (no tools, strict MCP, no
 * settings, structured output). Each call is logged with its input manifest.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../bundle";
import { type ClaudeRunner, claudeCliRunner } from "../classify";
import type { CallRecord } from "./schema";

export const CURATION_MODEL = "claude-sonnet-5-5";
export const PROMPT_DIR = join(import.meta.dir, "../../../config/curation");

export class OverBudgetError extends Error {}

/**
 * The D9 runner when CLAUDE_CODE_OAUTH_TOKEN is set; otherwise the same headless
 * flags on the local `claude` login. ANTHROPIC_API_KEY is blanked either way so
 * calls never bill the API account.
 */
export const curationRunner: ClaudeRunner = async (args) => {
	if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return claudeCliRunner(args);
	const p = Bun.spawn(
		[
			"claude", "-p", "--model", args.model, "--tools", "", "--strict-mcp-config",
			"--setting-sources", "", "--system-prompt", args.system,
			"--output-format", "json", "--json-schema", JSON.stringify(args.schema),
		],
		{
			cwd: "/tmp",
			stdin: new TextEncoder().encode(args.prompt),
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, ANTHROPIC_API_KEY: "" },
		},
	);
	const out = await new Response(p.stdout).text();
	const code = await p.exited;
	const res = JSON.parse(out || "{}");
	if (code !== 0 || res.is_error || !res.structured_output)
		throw new Error(`claude -p failed (${code}): ${out.slice(0, 300)}`);
	return { structured: res.structured_output, costUsd: res.total_cost_usd ?? 0 };
};

/** Spend meter for one arm on one bundle. A call that crosses the cap marks it over. */
export class Budget {
	spent = 0;
	over = false;
	readonly calls: CallRecord[] = [];
	constructor(readonly capUsd: number) {}

	record(call: CallRecord): void {
		this.calls.push(call);
		this.spent += call.costUsd;
		if (this.spent > this.capUsd) this.over = true;
	}
}

export function loadPrompt(name: string): { text: string; hash: string } {
	const text = readFileSync(join(PROMPT_DIR, `${name}.md`), "utf8");
	return { text, hash: sha256(text) };
}

export interface AgentCall {
	agent: string;
	round?: number;
	system: string;
	prompt: string;
	schema: object;
	/** What this agent was given (file names / evidence kinds), for the audit trail. */
	inputManifest: string[];
	model?: string;
}

export async function callAgent<T>(
	call: AgentCall,
	budget: Budget,
	runner: ClaudeRunner = curationRunner,
): Promise<T> {
	if (budget.over) throw new OverBudgetError(`over budget before ${call.agent}`);
	const model = call.model ?? CURATION_MODEL;
	let lastErr: unknown;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const { structured, costUsd } = await runner({
				model,
				system: call.system,
				prompt: call.prompt,
				schema: call.schema,
			});
			budget.record({
				agent: call.agent,
				round: call.round,
				model,
				promptHash: sha256(call.system + JSON.stringify(call.schema)),
				costUsd,
				inputManifest: call.inputManifest,
			});
			return structured as T;
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr;
}

/** Run `fn` over `xs` with at most `n` in flight. */
export async function pool<X, Y>(
	xs: X[],
	n: number,
	fn: (x: X, i: number) => Promise<Y>,
): Promise<Y[]> {
	const out: Y[] = new Array(xs.length);
	let next = 0;
	const worker = async () => {
		while (next < xs.length) {
			const i = next++;
			out[i] = await fn(xs[i] as X, i);
		}
	};
	await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker));
	return out;
}
