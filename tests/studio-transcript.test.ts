import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { trialTranscript } from "../src/studio/transcript";

describe("eval-studio transcript endpoint helper (task 4.3)", () => {
	function makeRun(): { runsDir: string; runId: string; trialId: string } {
		const runsDir = mkdtempSync(join(tmpdir(), "runs-"));
		const runId = "run-x";
		const trialId = "gsd-t1";
		const tdir = join(runsDir, runId, "trials", trialId, "transcripts");
		mkdirSync(tdir, { recursive: true });
		writeFileSync(
			join(tdir, "session-000.jsonl"),
			[
				JSON.stringify({
					type: "assistant",
					message: {
						role: "assistant",
						content: [
							{ type: "tool_use", id: "tu_1", name: "Read", input: { file_path: "/x" } },
						],
					},
				}),
				JSON.stringify({
					type: "user",
					message: {
						role: "user",
						content: [
							{ type: "tool_result", tool_use_id: "tu_1", content: "file body" },
						],
					},
				}),
			].join("\n"),
		);
		return { runsDir, runId, trialId };
	}

	test("returns rendered turns with request and response distinguishable", () => {
		const { runsDir, runId, trialId } = makeRun();
		const t = trialTranscript(runId, trialId, runsDir);
		if (!t) throw new Error("expected a transcript");
		expect(t.sessions).toHaveLength(1);
		const session = t.sessions[0];
		if (!session) throw new Error("expected a session");
		const turns = session.turns;
		const req = turns.find((x) => x.dir === "request");
		const res = turns.find((x) => x.dir === "response");
		expect(req).toMatchObject({ kind: "tool_use", tool: "Read" });
		expect(res).toMatchObject({ kind: "tool_result", forId: "tu_1", tool: "Read" });
	});

	test("null for a trial with no archived transcripts", () => {
		const { runsDir } = makeRun();
		expect(trialTranscript("run-x", "no-such-trial", runsDir)).toBeNull();
	});
});
