import {
	registerLiveSource,
	trialIdFromSandbox,
	unregisterLiveSource,
} from "../live/registry";
import type { Sandbox } from "../providers/types";
import type { DriverResult, DriverRunOptions, RunDriverSession } from "./types";

export interface PrintCliCommandContext extends DriverRunOptions {
	promptFile: string;
	outFile: string;
}

export interface PrintCliDriverOptions {
	buildCommand: (ctx: PrintCliCommandContext) => string;
	parseOutput: (
		output: string,
		stepIndex: number,
		exitCode: number,
	) => DriverResult;
}

/**
 * Shared executor for headless CLIs that take a prompt, print machine-readable
 * output, and may leave child processes holding stdout. The transcript is
 * always redirected to a sandbox-local file, then read in a separate exec.
 */
export function createPrintCliSessionRunner(
	opts: PrintCliDriverOptions,
): RunDriverSession {
	return async (
		sandbox: Sandbox,
		run: DriverRunOptions,
	): Promise<DriverResult> => {
		// Namespace by sandbox id, not just step index: shared-filesystem
		// providers can run multiple trials concurrently, so /tmp transcript
		// paths must not collide across sandboxes.
		const slot = `${sandbox.id.replace(/[^a-zA-Z0-9_.-]/g, "_")}-${run.stepIndex}`;
		const promptFile = `/tmp/he-prompt-${slot}.txt`;
		const outFile = `/tmp/he-out-${slot}.jsonl`;
		await sandbox.writeFile(promptFile, run.prompt);
		const command = opts.buildCommand({ ...run, promptFile, outFile });
		// Best-effort live tap: drop a disk pointer to this session's output file so
		// the studio's (separate) process can tail it while the build runs. Never
		// affects the build; the post-exit read below is unchanged (byte-identical
		// telemetry/archive). `local` = file on the host (worktree provider).
		const trialId = trialIdFromSandbox(sandbox.id);
		registerLiveSource(trialId, {
			outFile,
			local: sandbox.id.startsWith("worktree:"),
			sandboxId: sandbox.id,
		});
		try {
			const res = await sandbox.exec(command, {
				timeoutMs: run.timeoutMs,
				env: run.env,
			});
			const read = await sandbox.exec(`cat ${outFile}`, { timeoutMs: 120_000 });
			return opts.parseOutput(read.stdout, run.stepIndex, res.exitCode);
		} finally {
			unregisterLiveSource(trialId);
		}
	};
}
