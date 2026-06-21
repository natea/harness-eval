import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { getHarnessDriver, runnableHarnessIds } from "../src/driver";
import type { ExecOptions, ExecResult, Sandbox } from "../src/providers/types";
import {
	classifyCostSource,
	type ModelProfile,
	loadModels,
	resolveProfile,
} from "../src/models";
import type { CostSource, HarnessId } from "../src/types";

/**
 * Layer 1 driver contract suite (openspec: add-driver-contract-tests).
 *
 * Every registered harness driver must pass these assertions against a recorded
 * output fixture — no real spend, no network, no provisioned sandbox. Adding a
 * driver means adding a row to CASES plus a fixture file, not a new test file.
 */

interface ExecCall {
	command: string;
	opts?: ExecOptions;
}

/**
 * Records every write/exec and replays the driver's recorded transcript for the
 * read-back exec (`cat <outFile>`). The run exec returns empty stdout, mirroring
 * the file-redirect drivers use so a started service cannot hold stdout open.
 */
class FakeSandbox implements Sandbox {
	readonly workspacePath = "/workspace";
	readonly writes: { path: string; content: string }[] = [];
	readonly execs: ExecCall[] = [];
	touched = false;

	constructor(
		readonly id: string,
		private readonly transcript: string,
	) {}

	async exec(command: string, opts?: ExecOptions): Promise<ExecResult> {
		this.touched = true;
		this.execs.push({ command, opts });
		if (command.startsWith("cat /tmp/he-out-")) {
			return { exitCode: 0, stdout: this.transcript, stderr: "" };
		}
		return { exitCode: 0, stdout: "", stderr: "" };
	}

	async copyOut(): Promise<void> {}

	async writeFile(path: string, content: string): Promise<void> {
		this.touched = true;
		this.writes.push({ path, content });
	}

	async destroy(): Promise<void> {}
}

interface DriverContractCase {
	/** Harness id; must resolve to a registered driver. */
	harnessId: HarnessId;
	/** Fixture filename under tests/fixtures/driver-output/. */
	fixture: string;
	/** Worker profile used to classify the cost source from the parsed record. */
	profile: () => ModelProfile;
	expected: {
		costSource: CostSource;
		/** null when the source is tokens-only (no dollar figure). */
		costUsd: number | null;
		isError: boolean;
		sessionId: string;
		numTurns: number;
	};
}

function fixture(name: string): string {
	return readFileSync(
		join(import.meta.dir, "fixtures", "driver-output", name),
		"utf8",
	);
}

const CASES: DriverContractCase[] = [
	{
		harnessId: "claude-code",
		fixture: "claude-code.jsonl",
		profile: () => resolveProfile("claude-opus-4-6", loadModels()),
		expected: {
			costSource: "harness-reported",
			costUsd: 0.1342,
			isError: false,
			sessionId: "sess-contract-7f3a",
			numTurns: 7,
		},
	},
	{
		// Codex reports tokens but NO dollar cost, so the source falls through to
		// the profile pricing rule; against a non-anthropic, unpriced profile that
		// is tokens-only (costUsd null). thread_id is the session id; one
		// `codex exec` invocation is a single turn.
		harnessId: "codex",
		fixture: "codex.jsonl",
		profile: () => resolveProfile("glm-5.1", loadModels()),
		expected: {
			costSource: "tokens-only",
			costUsd: null,
			isError: false,
			sessionId: "0199c0de-c0de-7000-8000-000000000abc",
			numTurns: 1,
		},
	},
];

// Sanity: every runnable driver has a contract case. If this fails, a driver was
// registered without registering a conformance case — close the gap, don't skip.
test("every registered driver has a contract case", () => {
	const covered = new Set(CASES.map((c) => c.harnessId));
	for (const id of runnableHarnessIds()) {
		expect(covered.has(id as HarnessId)).toBe(true);
	}
});

describe.each(CASES)("driver contract: $harnessId", (c) => {
	const run = async () => {
		const driver = getHarnessDriver(c.harnessId);
		const sandbox = new FakeSandbox("trial.contract-1", fixture(c.fixture));
		const result = await driver.runSession(sandbox, {
			model: "model-under-test",
			prompt: "BASE PROMPT — identical across harnesses",
			stepIndex: 0,
			timeoutMs: 600_000,
			env: { TOKEN: "x" },
		});
		return { driver, sandbox, result };
	};

	test("dispatch: registry returns a driver whose id matches", () => {
		expect(getHarnessDriver(c.harnessId).id).toBe(c.harnessId);
		expect(runnableHarnessIds()).toContain(c.harnessId);
	});

	test("output captured to a file, read after the run exec returns", async () => {
		const { sandbox } = await run();
		// Prompt written to a namespaced file before the run.
		expect(sandbox.writes.length).toBe(1);
		expect(sandbox.writes[0]?.path).toMatch(/^\/tmp\/he-prompt-.*\.txt$/);
		// The transcript read is a SEPARATE exec, and it is the LAST exec — it
		// cannot precede or share the run exec, so a service started by the run
		// cannot hold the capture open.
		const readIdx = sandbox.execs.findIndex((e) =>
			e.command.startsWith("cat /tmp/he-out-"),
		);
		expect(readIdx).toBeGreaterThan(0);
		expect(readIdx).toBe(sandbox.execs.length - 1);
	});

	test("telemetry normalizes the fixture into the common SessionRecord", async () => {
		const { result } = await run();
		const r = result.record;
		expect(r.sessionId).toBe(c.expected.sessionId);
		expect(r.numTurns).toBe(c.expected.numTurns);
		expect(r.isError).toBe(c.expected.isError);
		expect(r.durationMs).toBeGreaterThanOrEqual(0);
		expect(r.usage.inputTokens).toBeGreaterThanOrEqual(0);
		expect(r.usage.outputTokens).toBeGreaterThanOrEqual(0);
		expect(result.sessionId).toBe(c.expected.sessionId);
		expect(result.transcript.length).toBeGreaterThan(0);
	});

	test("cost source classifies via the production classifier", async () => {
		const { result } = await run();
		const r = result.record;
		const est = classifyCostSource(
			c.profile(),
			r.costUsd,
			r.usage.inputTokens,
			r.usage.outputTokens,
		);
		expect(est.source).toBe(c.expected.costSource);
		if (c.expected.costUsd === null) {
			expect(est.costUsd).toBeNull();
		} else {
			expect(est.costUsd).toBeCloseTo(c.expected.costUsd, 6);
		}
	});

	test("fairness: the base prompt reaches the sandbox unmutated", async () => {
		const { sandbox } = await run();
		expect(sandbox.writes[0]?.content).toBe(
			"BASE PROMPT — identical across harnesses",
		);
	});
});

test("unregistered harness fails fast before any sandbox use", () => {
	const sandbox = new FakeSandbox("trial.unused", "");
	expect(() => getHarnessDriver("nonexistent-harness")).toThrow(
		/unknown harness|unsupported harness/,
	);
	// Resolution is a pure registry lookup — it must not touch the sandbox.
	expect(sandbox.touched).toBe(false);
});
