import { expect, test } from "bun:test";
import { renderBrownfieldReport } from "../src/report/brownfield";
import type { RunResults } from "../src/types";

function trial(
	candidate: string,
	taskId: string,
	verdict: "resolved" | "unresolved",
) {
	return {
		provenance: {
			runId: "r1",
			trialId: `${candidate}-${taskId}`,
			candidate,
			candidateVersion: "1",
			harness: "claude-code",
			harnessVersion: "1",
			model: "claude-haiku-4-5",
			provider: "worktree",
			startedAt: "2026-01-01T00:00:00Z",
			endedAt: "2026-01-01T00:20:00Z",
			prdSha256: "0".repeat(64),
			testPlanSha256: null,
			sessionScript: [],
			status: "completed",
			cappedBy: null,
			notes: [],
			brownfield: {
				repoDir: "Future-House__paper-qa",
				taskId,
				variant: "body",
				bundleSha256: "0".repeat(64),
				baseSha: "1234567",
				mergeSha: "7654321",
			},
		},
		telemetry: {
			sessions: [],
			agentDurationMs: 600_000,
			setupDurationMs: 0,
			totalCostUsd: 0.5,
			totalTokens: {
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheCreationTokens: 0,
			},
			totalTurns: 3,
		},
		grades: null,
		resolution: {
			verdict,
			reason: verdict === "resolved" ? null : "fail-to-pass",
			failToPass: {},
			passToPass: {},
			testInfraModified: [],
			cassetteMiss: [],
		},
	} satisfies Record<string, unknown>;
}

test("renders resolution, strata and original PR baseline columns", () => {
	const results = {
		trials: [
			trial("bare", "pr1262-issue1257", "resolved"),
			trial("bare", "pr1311-issue1310", "unresolved"),
		],
	} as unknown as RunResults;
	const md = renderBrownfieldReport(results);
	expect(md).toContain("## Resolution by candidate");
	expect(md).toContain(
		"| bare | 2 | 1 (50%) | 1 (50%) | 1 | 0 | 10.0m | $0.50 | $0.50 |",
	);
	expect(md).toContain("## Resolution by body leak level");
	expect(md).toContain("symptom");
	expect(md).toContain("## Unresolved by reason");
	expect(md).toContain("fail-to-pass: 1");
	expect(md).toContain("not as a counterfactual");
});

test("renders the judge signal when trials carry one", () => {
	const withJudge = trial("bare", "pr1262-issue1257", "unresolved") as Record<
		string,
		unknown
	>;
	withJudge.judge = {
		resolvesIssue: false,
		quality: "partial",
		notes: "touches the right module | but not the crash",
		model: "claude-sonnet-4-6",
	};
	const md = renderBrownfieldReport({
		trials: [withJudge],
	} as unknown as RunResults);
	expect(md).toContain(
		"## Judge signal (claude-sonnet-4-6; blind to the hidden tests)",
	);
	expect(md).toContain("| bare | pr1262-issue1257 | partial | no |");
	expect(md).not.toContain("touches the right module | but");
});
