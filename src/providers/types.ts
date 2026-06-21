export interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface ExecOptions {
	/** Working directory inside the sandbox (defaults to the workspace root). */
	cwd?: string;
	/** Extra environment variables for this command. */
	env?: Record<string, string>;
	/** Kill the command after this many milliseconds. */
	timeoutMs?: number;
}

/**
 * One isolated trial environment. Implementations must guarantee that
 * nothing a trial installs (plugins, skills, npm globals, files) is visible
 * to any other sandbox or to the host's own configuration.
 */
export interface Sandbox {
	id: string;
	/** Absolute path of the trial workspace inside the sandbox. */
	workspacePath: string;
	exec(command: string, opts?: ExecOptions): Promise<ExecResult>;
	/** Copy a file or directory from the sandbox to a host destination. */
	copyOut(sandboxPath: string, hostDest: string): Promise<void>;
	/** Write a file into the sandbox. */
	writeFile(sandboxPath: string, content: string): Promise<void>;
	destroy(): Promise<void>;
}

export type ProviderId = "daytona" | "e2b" | "docker" | "macos-vz" | "worktree";

export interface PreflightContext {
	/** Per-trial wall-clock budget the provider must be able to sustain. */
	trialWallClockMs: number;
	concurrency: number;
}

export class PreflightError extends Error {}

export interface SandboxProvider {
	readonly id: ProviderId;
	/** Identifier of the base image/snapshot/template, or null when not applicable. */
	readonly snapshotId: string | null;
	/**
	 * Validate the provider can run this configuration BEFORE any trial is
	 * dispatched (daemon reachable, image/template present, lifetime and
	 * resource policies admit the budget). Throws PreflightError with
	 * remediation guidance on failure.
	 */
	preflight?(ctx: PreflightContext): Promise<void>;
	provision(trialId: string): Promise<Sandbox>;
}
