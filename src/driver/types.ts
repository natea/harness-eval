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
