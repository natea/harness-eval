import type { Sandbox } from "../providers/types";
import type { HarnessId, SessionRecord } from "../types";

export interface DriverResult {
	record: SessionRecord;
	/** Final result text from the session (used for gate detection). */
	resultText: string;
	sessionId: string;
	/** Raw session transcript, usually one JSON object per line. */
	transcript: string;
}

export interface DriverRunOptions {
	model: string;
	prompt: string;
	stepIndex: number;
	/** Resume an existing session instead of starting fresh. */
	resumeSessionId?: string;
	timeoutMs: number;
	env?: Record<string, string>;
}

export type RunDriverSession = (
	sandbox: Sandbox,
	opts: DriverRunOptions,
) => Promise<DriverResult>;

export interface HarnessDriver {
	readonly id: HarnessId;
	runSession: RunDriverSession;
}

/**
 * A driver-level failure that is environmental, not the candidate's fault — a
 * dead daemon, an unreachable socket, a protocol-handshake mismatch. The
 * session executor re-throws these so the scheduler classifies the trial as
 * `infra-failed` (retried), instead of grading a broken workspace as a
 * candidate result. Carries `isInfra` so the classifier needn't string-match.
 */
export class InfraError extends Error {
	readonly isInfra = true;
}

/** True for errors that should drive infra-failure classification/retry. */
export function isInfraError(err: unknown): err is InfraError {
	return (
		err instanceof InfraError ||
		(typeof err === "object" && err !== null && "isInfra" in err)
	);
}
