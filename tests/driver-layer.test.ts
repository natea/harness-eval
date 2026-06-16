import { describe, expect, test } from "bun:test";
import { getHarnessDriver, runnableHarnessIds } from "../src/driver";
import { runClaudeSession } from "../src/driver/claude";
import { createPrintCliSessionRunner } from "../src/driver/print-cli";
import { executeSessionScript } from "../src/driver/session";
import type { HarnessDriver } from "../src/driver/types";
import type { ExecOptions, ExecResult, Sandbox } from "../src/providers/types";

interface ExecCall {
	command: string;
	opts?: ExecOptions;
}

class FakeSandbox implements Sandbox {
	readonly workspacePath = "/workspace";
	readonly writes: { path: string; content: string }[] = [];
	readonly execs: ExecCall[] = [];

	constructor(
		readonly id: string,
		private readonly output: string,
	) {}

	async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
		this.execs.push({ command, opts });
		if (command.startsWith("cat /tmp/he-out-")) {
			return { exitCode: 0, stdout: this.output, stderr: "" };
		}
		return { exitCode: 0, stdout: "", stderr: "" };
	}

	async copyOut(): Promise<void> {}

	async writeFile(path: string, content: string): Promise<void> {
		this.writes.push({ path, content });
	}

	async destroy(): Promise<void> {}
}

function resultLine(sessionId = "s-1"): string {
	return `${JSON.stringify({
		type: "result",
		is_error: false,
		duration_ms: 123,
		num_turns: 2,
		total_cost_usd: 0.25,
		session_id: sessionId,
		result: "done",
		usage: {
			input_tokens: 10,
			output_tokens: 5,
			cache_read_input_tokens: 1,
			cache_creation_input_tokens: 2,
		},
	})}\n`;
}

describe("shared print-cli driver", () => {
	test("writes prompt to a namespaced file, captures output by file, and propagates env/timeout", async () => {
		const runner = createPrintCliSessionRunner({
			buildCommand: (ctx) =>
				`print-tool --model ${ctx.model} --prompt ${ctx.promptFile} --out ${ctx.outFile}`,
			parseOutput: (output, stepIndex, exitCode) => ({
				record: {
					sessionId: "custom-session",
					stepIndex,
					durationMs: 1,
					numTurns: 1,
					costUsd: 0,
					usage: {
						inputTokens: output.length,
						outputTokens: exitCode,
						cacheReadTokens: 0,
						cacheCreationTokens: 0,
					},
					isError: false,
				},
				resultText: output,
				sessionId: "custom-session",
				transcript: output,
			}),
		});
		const sandbox = new FakeSandbox("trial bad/$", "raw transcript");

		const result = await runner(sandbox, {
			model: "m-1",
			prompt: "build this",
			stepIndex: 3,
			timeoutMs: 456,
			env: { TOKEN: "secret" },
		});

		expect(sandbox.writes).toEqual([
			{
				path: "/tmp/he-prompt-trial_bad__-3.txt",
				content: "build this",
			},
		]);
		expect(sandbox.execs[0]?.command).toBe(
			"print-tool --model m-1 --prompt /tmp/he-prompt-trial_bad__-3.txt --out /tmp/he-out-trial_bad__-3.jsonl",
		);
		expect(sandbox.execs[0]?.opts).toEqual({
			timeoutMs: 456,
			env: { TOKEN: "secret" },
		});
		expect(sandbox.execs[1]?.command).toBe(
			"cat /tmp/he-out-trial_bad__-3.jsonl",
		);
		expect(sandbox.execs[1]?.opts).toEqual({ timeoutMs: 120_000 });
		expect(result.record.sessionId).toBe("custom-session");
		expect(result.resultText).toBe("raw transcript");
	});

	test("claude driver preserves the existing headless stream-json command shape", async () => {
		const sandbox = new FakeSandbox("trial.1", resultLine("s-2"));
		const result = await runClaudeSession(sandbox, {
			model: "claude-opus-4-6",
			prompt: "implement",
			stepIndex: 2,
			resumeSessionId: "s-previous",
			timeoutMs: 789,
			env: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
		});

		expect(sandbox.writes).toEqual([
			{ path: "/tmp/he-prompt-trial.1-2.txt", content: "implement" },
		]);
		expect(sandbox.execs[0]?.command).toBe(
			'cat /tmp/he-prompt-trial.1-2.txt | claude -p --model "claude-opus-4-6" --output-format stream-json --verbose --dangerously-skip-permissions --resume "s-previous" > /tmp/he-out-trial.1-2.jsonl 2>&1',
		);
		expect(sandbox.execs[0]?.opts).toEqual({
			timeoutMs: 789,
			env: { CLAUDE_CODE_OAUTH_TOKEN: "token" },
		});
		expect(result.record.costUsd).toBe(0.25);
		expect(result.sessionId).toBe("s-2");
	});

	test("driver registry exposes only runnable harnesses", () => {
		expect(runnableHarnessIds()).toEqual(["claude-code"]);
		expect(getHarnessDriver("claude-code").id).toBe("claude-code");
		expect(() => getHarnessDriver("codex")).toThrow(/unknown harness/);
	});

	test("session execution uses the supplied driver and preserves resume semantics", async () => {
		const calls: Parameters<HarnessDriver["runSession"]>[1][] = [];
		const driver: HarnessDriver = {
			id: "claude-code",
			runSession: async (_sandbox, opts) => {
				calls.push(opts);
				return {
					record: {
						sessionId: `s-${opts.stepIndex}`,
						stepIndex: opts.stepIndex,
						durationMs: 10,
						numTurns: 1,
						costUsd: 0,
						usage: {
							inputTokens: 1,
							outputTokens: 1,
							cacheReadTokens: 0,
							cacheCreationTokens: 0,
						},
						isError: false,
					},
					resultText: "done",
					sessionId: `s-${opts.stepIndex}`,
					transcript: `{ "step": ${opts.stepIndex} }`,
				};
			},
		};

		const result = await executeSessionScript(
			new FakeSandbox("trial", resultLine()),
			{
				driver,
				model: "model-a",
				steps: [
					{ prompt: "one", newSession: false },
					{ prompt: "two", newSession: false },
					{ prompt: "three", newSession: true },
				],
				continuation: { allowlist: ["proceed"], maxContinuations: 1 },
				wallClockBudgetMs: 60_000,
				costBudgetUsd: 10,
				env: { KEY: "value" },
			},
		);

		expect(result.status).toBe("completed");
		expect(calls.map((c) => c.prompt)).toEqual(["one", "two", "three"]);
		expect(calls.map((c) => c.resumeSessionId)).toEqual([
			undefined,
			"s-0",
			undefined,
		]);
		expect(calls.every((c) => c.model === "model-a")).toBe(true);
		expect(calls.every((c) => c.env?.KEY === "value")).toBe(true);
	});
});
