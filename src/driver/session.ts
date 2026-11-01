import type { Sandbox } from "../providers/types";
import type { ContinuationPolicy, SessionRecord, SessionStep } from "../types";
import { claudeCodeDriver } from "./claude";
import { reportsCumulativeResumeCost } from "./telemetry";
import {
	type DriverResult,
	type HarnessDriver,
	isInfraError,
	type RunDriverSession,
} from "./types";

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
	/** Trial isolation: no operator MCP config, no provider-side web tools. */
	isolated?: boolean;
	/** Egress lockdown: run worker commands in a loopback-only namespace. */
	netns?: { script: string };
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
	// Recent Claude Code reports a resumed session's total since it began, not this
	// step's cost; summing those would count every earlier step again.
	const reportedBySession = new Map<string, number>();
	const ownCost = (result: DriverResult, resumedFrom?: string): void => {
		const prior = resumedFrom ? (reportedBySession.get(resumedFrom) ?? 0) : 0;
		const reported = result.record.costUsd;
		if (result.record.partial) {
			// Estimated from this step's own messages, so already per-step.
			reportedBySession.set(result.sessionId, prior + reported);
			return;
		}
		if (!reportsCumulativeResumeCost(result.harnessVersion)) return;
		reportedBySession.set(result.sessionId, reported);
		// A running total can't fall; if this one did, it's already per-step.
		if (reported >= prior) result.record.costUsd = reported - prior;
	};
	const failed = (message: string): SessionScriptResult => {
		notes.push(message);
		return remainingMs() <= 0
			? capped("wall-clock")
			: { records, transcripts, status: "error", cappedBy: null, notes };
	};

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
		const resumedFrom = step.newSession ? undefined : sessionId;
		try {
			result = await run(sandbox, {
				model: opts.model,
				prompt: step.prompt,
				stepIndex: stepIndex++,
				resumeSessionId: resumedFrom,
				timeoutMs: remainingMs(),
				env: opts.env,
				isolated: opts.isolated,
				netns: opts.netns,
			});
		} catch (err) {
			// Environmental failures (dead daemon, unreachable socket, ACP
			// handshake mismatch) are not the candidate's fault — propagate so the
			// scheduler classifies the trial as infra-failed (and retries), rather
			// than grading a broken workspace as a candidate result.
			if (isInfraError(err)) throw err;
			return failed(`step ${i} failed: ${err}`);
		}
		ownCost(result, resumedFrom);
		records.push(result.record);
		transcripts.push(result.transcript);
		sessionId = result.sessionId || sessionId;
		spentUsd += result.record.costUsd;
		if (result.record.isError)
			return failed(
				result.record.partial
					? `step ${i} ended without a result message (exit ${result.exitCode}); telemetry partial, cost estimated`
					: `step ${i} returned error result`,
			);

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
			const contFrom = sessionId;
			let cont: DriverResult;
			try {
				cont = await run(sandbox, {
					model: opts.model,
					prompt: continuationPrompt,
					stepIndex: stepIndex++,
					resumeSessionId: contFrom,
					timeoutMs: remainingMs(),
					env: opts.env,
					isolated: opts.isolated,
					netns: opts.netns,
				});
			} catch (err) {
				if (isInfraError(err)) throw err;
				return failed(`continuation after step ${i} failed: ${err}`);
			}
			ownCost(cont, contFrom);
			records.push(cont.record);
			transcripts.push(cont.transcript);
			sessionId = cont.sessionId || sessionId;
			spentUsd += cont.record.costUsd;
			text = cont.resultText;
			continuations++;
			if (cont.record.isError) {
				return failed(`continuation after step ${i} errored`);
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
