import { execFile } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
	ExecOptions,
	ExecResult,
	Sandbox,
	SandboxProvider,
} from "./types";

const execFileAsync = promisify(execFile);

/** Rebuildable, large dirs that never belong in an archived workspace. */
const NON_ARCHIVE_DIRS = new Set([
	".venv",
	".pytest_cache",
	"__pycache__",
	".ruff_cache",
]);

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

/** Host vars a trial inherits; all others (credentials, proxies) are dropped. */
const INHERITED_ENV = [
	"PATH",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TERM",
	"TZ",
	"SHELL",
	"TMPDIR",
];

function trialEnv(
	home: string,
	claudeConfigDir: string,
	extra?: Record<string, string>,
) {
	const env: Record<string, string> = {};
	for (const key of INHERITED_ENV) {
		const v = process.env[key];
		if (v !== undefined) env[key] = v;
	}
	return {
		...env,
		HOME: home,
		CLAUDE_CONFIG_DIR: claudeConfigDir,
		npm_config_prefix: join(home, ".npm-global"),
		XDG_CONFIG_HOME: join(home, ".config"),
		XDG_CACHE_HOME: join(home, ".cache"),
		XDG_DATA_HOME: join(home, ".local", "share"),
		...extra,
	};
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
		const env = trialEnv(this.home, this.claudeConfigDir, opts.env);
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
		// Environment dirs are rebuildable and gigabytes each (paper-qa: ~8 GB);
		// archiving them costs minutes and fills the disk. The candidate patch is
		// captured separately, so the archive never needs them.
		cpSync(src, hostDest, {
			recursive: true,
			filter: (p) => !NON_ARCHIVE_DIRS.has(basename(p)),
		});
	}

	async copyIn(hostSrc: string, sandboxPath: string): Promise<void> {
		const dest = isAbsolute(sandboxPath)
			? sandboxPath
			: join(this.workspacePath, sandboxPath);
		mkdirSync(dest, { recursive: true });
		// Merge the source's *contents* into dest (mirrors copyOut), so a sealed
		// repo's `.git` lands directly in the workspace, not a nested directory.
		for (const entry of readdirSync(hostSrc))
			cpSync(join(hostSrc, entry), join(dest, entry), { recursive: true });
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
