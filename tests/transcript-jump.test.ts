import { describe, expect, test } from "bun:test";
import type { Turn } from "../src/report/transcript-render";
import { bestTurnMatch, extractTerms } from "../src/studio/views/TrialView";

describe("step → conversation jump matching (trace from a failing step)", () => {
	test("extractTerms pulls probed tokens out of evaluator evidence", () => {
		const evidence =
			"No HTTP server extension implemented. grep for 'Bun.serve', '--port', 'api/v1', 'http' returned nothing.";
		const terms = extractTerms(evidence);
		expect(terms).toContain("Bun.serve");
		expect(terms).toContain("--port");
		expect(terms).toContain("api/v1");
		// 'http' is too common to be a useful anchor → filtered out
		expect(terms).not.toContain("http");
	});

	test("bestTurnMatch lands on the turn where the agent did that work", () => {
		const sessions = [
			{
				name: "session-000.jsonl",
				turns: [
					{ kind: "assistant", dir: "response", role: "assistant", text: "Reading the spec." },
					{ kind: "tool_use", dir: "request", role: "assistant", id: "t1", tool: "Bash", input: { cmd: "ls" } },
					{
						kind: "tool_use",
						dir: "request",
						role: "assistant",
						id: "t2",
						tool: "Write",
						input: { file_path: "src/server.ts", contents: "Bun.serve({ port: 3000 })" },
					},
				] as Turn[],
			},
		];
		const terms = extractTerms("expected 'Bun.serve' with '--port'");
		expect(bestTurnMatch(sessions, terms)).toBe("c-0-2");
	});

	test("no match → null (caller falls back to the section header)", () => {
		const sessions = [
			{ name: "s", turns: [{ kind: "assistant", dir: "response", role: "assistant", text: "hello" }] as Turn[] },
		];
		expect(bestTurnMatch(sessions, extractTerms("'NonexistentSymbol.foo'"))).toBeNull();
		expect(bestTurnMatch(sessions, [])).toBeNull();
	});
});
