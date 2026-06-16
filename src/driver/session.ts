import type { Sandbox } from "../providers/types";
import type { ContinuationPolicy, SessionRecord, SessionStep } from "../types";
import { claudeCodeDriver } from "./claude";
import type { DriverResult, HarnessDriver, RunDriverSession } from "./types";

export interface SessionScriptResult {
	records: SessionRecord[];
	transcripts: string[];
	status: "completed" | "capped" | "error";
	cappedBy: "wall-clock" | "cost" | null;
	notes: string[];
}

export interface SessionScriptOptions {
	model: string;
	steps: SessionStep[];
	continuation: ContinuationPolicy;
	wallClockBudgetMs: number;
	costBudgetUsd: number;
	env?: Record<string, string>;
	/** Harness implementation; defaults to Claude Code for compatibility. */
	driver?: HarnessDriver;
	/** Injected for focused tests; overrides `driver`. */
	runSession?: RunDriverSession;
}

/** Heuristic gate detection: the framework paused awaiting approval. */
export function looksLikeGate(resultText: string): boolean {
	const tail = resultText.trim().slice(-400).toLowerCase();
	if (!tail) return false;
	if (!tail.includes("?")) return false;
	return /(approve|proceed|continue|ready to|shall i|should i|ok to|confirm|go ahead)/.test(
		tail,
	);
}

/**
 * Execute a candidate's session script: ordered steps, resume-by-default,
 * generic continuations at approval gates (content-free allowlist only), and
 * hard wall-clock/cost caps producing `capped` status (eval-orchestration
 * spec: budget enforcement).
 */
export async function executeSessionScript(
	sandbox: Sandbox,
	opts: SessionScriptOptions,
): Promise<SessionScriptResult> {
	const run =
		opts.runSession ?? opts.driver?.runSession ?? claudeCodeDriver.runSession;
	const records: SessionRecord[] = [];
	const transcripts: string[] = [];
	const notes: string[] = [];
	const startedAt = Date.now();
	let spentUsd = 0;
	let sessionId: string | undefined;
	let stepIndex = 0;

	const remainingMs = () => opts.wallClockBudgetMs - (Date.now() - startedAt);
	const capped = (by: "wall-clock" | "cost"): SessionScriptResult => ({
		records,
		transcripts,
		status: "capped",
		cappedBy: by,
		notes,
	});

	for (const [i, step] of opts.steps.entries()) {
		if (remainingMs() <= 0) return capped("wall-clock");
		if (spentUsd >= opts.costBudgetUsd) return capped("cost");

		let result: DriverResult;
		try {
			result = await run(sandbox, {
				model: opts.model,
				prompt: step.prompt,
				stepIndex: stepIndex++,
				resumeSessionId: step.newSession ? undefined : sessionId,
				timeoutMs: remainingMs(),
				env: opts.env,
			});
		} catch (err) {
			notes.push(`step ${i} failed: ${err}`);
			return { records, transcripts, status: "error", cappedBy: null, notes };
		}
		records.push(result.record);
		transcripts.push(result.transcript);
		sessionId = result.sessionId || sessionId;
		spentUsd += result.record.costUsd;
		if (result.record.isError) {
			notes.push(`step ${i} returned error result`);
			return { records, transcripts, status: "error", cappedBy: null, notes };
		}

		// Approval gates: issue generic continuations until the gate clears.
		let continuations = 0;
		let text = result.resultText;
		while (
			looksLikeGate(text) &&
			continuations < opts.continuation.maxContinuations
		) {
			if (remainingMs() <= 0) return capped("wall-clock");
			if (spentUsd >= opts.costBudgetUsd) return capped("cost");
			const continuationPrompt = opts.continuation.allowlist[0] ?? "proceed";
			notes.push(
				`step ${i}: continuation ${continuations + 1} ('${continuationPrompt}')`,
			);
			const cont = await run(sandbox, {
				model: opts.model,
				prompt: continuationPrompt,
				stepIndex: stepIndex++,
				resumeSessionId: sessionId,
				timeoutMs: remainingMs(),
				env: opts.env,
			});
			records.push(cont.record);
			transcripts.push(cont.transcript);
			sessionId = cont.sessionId || sessionId;
			spentUsd += cont.record.costUsd;
			text = cont.resultText;
			continuations++;
			if (cont.record.isError) {
				notes.push(`continuation after step ${i} errored`);
				return { records, transcripts, status: "error", cappedBy: null, notes };
			}
		}
		if (continuations >= opts.continuation.maxContinuations) {
			notes.push(
				`step ${i}: stalled at gate after ${continuations} continuations`,
			);
			return { records, transcripts, status: "error", cappedBy: null, notes };
		}
	}
	return { records, transcripts, status: "completed", cappedBy: null, notes };
}
