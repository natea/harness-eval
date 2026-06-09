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

export interface SandboxProvider {
  readonly id: "daytona" | "worktree";
  /** Identifier of the base image/snapshot, or null when not applicable. */
  readonly snapshotId: string | null;
  provision(trialId: string): Promise<Sandbox>;
}
