import { expect, test } from "bun:test";
import { buildCodexCommand, parseCodexJsonl } from "../src/driver/codex";

const base = {
	model: "qwen3-coder",
	prompt: "x",
	stepIndex: 0,
	timeoutMs: 1000,
	promptFile: "/tmp/p.txt",
	outFile: "/tmp/o.jsonl",
} as const;

test("oss profile adds --oss --local-provider and no codex login", () => {
	const cmd = buildCodexCommand({ ...base, ossProvider: "ollama" });
	expect(cmd).toContain("--oss --local-provider ollama");
	expect(cmd).toContain('--model "qwen3-coder"');
	expect(cmd).not.toContain("codex login");
});

test("non-oss profile keeps the auth block", () => {
	const cmd = buildCodexCommand(base);
	expect(cmd).toContain("codex login");
	expect(cmd).not.toContain("--oss");
});

test("codex parser accepts current item-only successful JSON streams", () => {
	const out = [
		JSON.stringify({ type: "thread.started", thread_id: "th-local" }),
		JSON.stringify({ type: "turn.started" }),
		JSON.stringify({
			type: "item.completed",
			item: {
				type: "command_execution",
				status: "completed",
				exit_code: 0,
				aggregated_output: "wrote setup.sh and run.sh",
			},
		}),
	].join("\n");

	const parsed = parseCodexJsonl(out, 0, 0);

	expect(parsed.record.isError).toBe(false);
	expect(parsed.record.numTurns).toBe(1);
	expect(parsed.sessionId).toBe("th-local");
});
