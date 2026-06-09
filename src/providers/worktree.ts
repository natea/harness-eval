import { execFile } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
	ExecOptions,
	ExecResult,
	Sandbox,
	SandboxProvider,
} from "./types";

const execFileAsync = promisify(execFile);

/**
 * Local fallback isolation. Each trial gets:
 *   - a dedicated workspace directory under runs/<run-id>/trials/<trial-id>/ws
 *   - a dedicated CLAUDE_CONFIG_DIR so plugin/skill installs are invisible to
 *     other trials and to the host's own Claude Code configuration
 *   - a dedicated HOME so ~/.claude, ~/.npm etc. are per-trial
 *
 * Weaker than Daytona (shared OS, shared network); recorded as such in
 * provenance — results across providers are flagged as not directly
 * comparable.
 */
export class WorktreeProvider implements SandboxProvider {
	readonly id = "worktree" as const;
	readonly snapshotId = null;

	constructor(private baseDir: string) {}

	async provision(trialId: string): Promise<Sandbox> {
		const root = resolve(this.baseDir, trialId);
		const workspace = join(root, "ws");
		const home = join(root, "home");
		const claudeConfig = join(home, ".claude-config");
		for (const d of [workspace, home, claudeConfig])
			mkdirSync(d, { recursive: true });
		await execFileAsync("git", ["init", "-q"], { cwd: workspace });
		return new WorktreeSandbox(trialId, root, workspace, home, claudeConfig);
	}
}

class WorktreeSandbox implements Sandbox {
	readonly id: string;

	constructor(
		trialId: string,
		private root: string,
		readonly workspacePath: string,
		private home: string,
		private claudeConfigDir: string,
	) {
		this.id = `worktree:${trialId}`;
	}

	async exec(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
		const env = {
			...process.env,
			HOME: this.home,
			CLAUDE_CONFIG_DIR: this.claudeConfigDir,
			npm_config_prefix: join(this.home, ".npm-global"),
			...opts.env,
		};
		try {
			const { stdout, stderr } = await execFileAsync("zsh", ["-c", command], {
				cwd: opts.cwd ?? this.workspacePath,
				env,
				timeout: opts.timeoutMs,
				maxBuffer: 64 * 1024 * 1024,
			});
			return { exitCode: 0, stdout, stderr };
		} catch (err) {
			const e = err as {
				code?: number | string;
				stdout?: string;
				stderr?: string;
			};
			return {
				exitCode: typeof e.code === "number" ? e.code : 1,
				stdout: e.stdout ?? "",
				stderr: e.stderr ?? String(err),
			};
		}
	}

	async copyOut(sandboxPath: string, hostDest: string): Promise<void> {
		const src = isAbsolute(sandboxPath)
			? sandboxPath
			: join(this.workspacePath, sandboxPath);
		mkdirSync(hostDest, { recursive: true });
		cpSync(src, hostDest, { recursive: true });
	}

	async writeFile(sandboxPath: string, content: string): Promise<void> {
		const dest = isAbsolute(sandboxPath)
			? sandboxPath
			: join(this.workspacePath, sandboxPath);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, content);
	}

	async destroy(): Promise<void> {
		// Workspace archival happens before destroy; remove only the trial root.
		rmSync(this.root, { recursive: true, force: true });
	}
}
