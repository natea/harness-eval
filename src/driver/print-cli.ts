import {
	registerLiveSource,
	trialIdFromSandbox,
	unregisterLiveSource,
} from "../live/registry";
import { EXIT_TIMED_OUT } from "../providers/cli-container";
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
	/**
	 * Salvage a session that ended without its final message (usually the wall
	 * clock), so its transcript and spend aren't lost. Null when the CLI produced
	 * no work; the parse error then propagates (e.g. harness never started).
	 */
	parsePartial?: (
		output: string,
		stepIndex: number,
		exitCode: number,
		elapsedMs: number,
	) => DriverResult | null;
	/** Stops the CLI inside a container after a timeout: the exec client dying doesn't. */
	stopCommand?: string;
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
		// Shared /tmp on worktree-style providers: a stale file from an earlier
		// run with the same trial id would otherwise be read back as this
		// session's transcript if the CLI exits without writing.
		await sandbox.exec(`rm -f ${promptFile} ${outFile}`, { timeoutMs: 30_000 });
		await sandbox.writeFile(promptFile, run.prompt);
		let command = opts.buildCommand({ ...run, promptFile, outFile });
		if (run.netns) {
			// File-based to avoid nested quoting between zsh and the wrapper.
			const cmdFile = `/tmp/he-cmd-${slot}.sh`;
			await sandbox.writeFile(cmdFile, command);
			command = `unshare -rn sh ${run.netns.script} zsh ${cmdFile}`;
		}
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
			const startedAt = Date.now();
			const res = await sandbox.exec(command, {
				timeoutMs: run.timeoutMs,
				env: run.env,
			});
			const elapsedMs = Date.now() - startedAt;
			// Otherwise the agent keeps editing while the patch is being captured.
			// Never on worktree: that pattern would match the operator's own sessions.
			if (
				res.exitCode === EXIT_TIMED_OUT &&
				opts.stopCommand &&
				!sandbox.id.startsWith("worktree:")
			)
				await sandbox.exec(opts.stopCommand, { timeoutMs: 30_000 });
			const read = await sandbox.exec(`cat ${outFile}`, { timeoutMs: 120_000 });
			try {
				return opts.parseOutput(read.stdout, run.stepIndex, res.exitCode);
			} catch (err) {
				const partial = opts.parsePartial?.(
					read.stdout,
					run.stepIndex,
					res.exitCode,
					elapsedMs,
				);
				if (partial) return partial;
				throw err;
			}
		} finally {
			unregisterLiveSource(trialId);
		}
	};
}
