import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Daytona, type Sandbox as DaytonaSandbox } from "@daytonaio/sdk";
import type { ExecOptions, ExecResult, Sandbox, SandboxProvider } from "./types";

const WORKSPACE = "/home/daytona/workspace";

/**
 * Daytona-backed isolation. Each trial gets a fresh sandbox created from a
 * pinned snapshot that bakes in Node 18+, Bun, git, and the pinned Claude
 * Code version (see infra/daytona-snapshot/ for the snapshot definition).
 */
export class DaytonaProvider implements SandboxProvider {
  readonly id = "daytona" as const;
  readonly snapshotId: string;
  private client: Daytona;

  constructor(snapshotId: string) {
    const apiKey = process.env.DAYTONA_API_KEY;
    if (!apiKey) throw new Error("DAYTONA_API_KEY is not set");
    this.client = new Daytona({ apiKey });
    this.snapshotId = snapshotId;
  }

  async provision(trialId: string): Promise<Sandbox> {
    const sandbox = await this.client.create({
      snapshot: this.snapshotId,
      labels: { "harness-eval/trial": trialId },
    });
    await sandbox.process.executeCommand(`mkdir -p ${WORKSPACE}`);
    return new DaytonaTrialSandbox(sandbox, trialId);
  }
}

class DaytonaTrialSandbox implements Sandbox {
  readonly id: string;
  readonly workspacePath = WORKSPACE;

  constructor(
    private sandbox: DaytonaSandbox,
    trialId: string,
  ) {
    this.id = `daytona:${sandbox.id}:${trialId}`;
  }

  async exec(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const env = opts.env ? Object.entries(opts.env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ") : "";
    const wrapped = env ? `env ${env} ${command}` : command;
    const timeoutSec = opts.timeoutMs ? Math.ceil(opts.timeoutMs / 1000) : undefined;
    const res = await this.sandbox.process.executeCommand(
      wrapped,
      opts.cwd ?? this.workspacePath,
      undefined,
      timeoutSec,
    );
    return { exitCode: res.exitCode, stdout: res.result ?? "", stderr: "" };
  }

  async copyOut(sandboxPath: string, hostDest: string): Promise<void> {
    mkdirSync(hostDest, { recursive: true });
    const tarPath = `/tmp/harness-eval-out.tar.gz`;
    const tar = await this.exec(
      `tar -czf ${tarPath} -C ${JSON.stringify(sandboxPath)} . 2>/dev/null || tar -czf ${tarPath} ${JSON.stringify(sandboxPath)}`,
    );
    if (tar.exitCode !== 0) throw new Error(`tar failed in sandbox: ${tar.stdout}`);
    const local = join(hostDest, ".transfer.tar.gz");
    const bytes = await this.sandbox.fs.downloadFile(tarPath);
    writeFileSync(local, bytes);
    execFileSync("tar", ["-xzf", local, "-C", hostDest]);
    execFileSync("rm", ["-f", local]);
  }

  async writeFile(sandboxPath: string, content: string): Promise<void> {
    await this.exec(`mkdir -p ${JSON.stringify(dirname(sandboxPath))}`);
    await this.sandbox.fs.uploadFile(Buffer.from(content, "utf8"), sandboxPath);
  }

  async destroy(): Promise<void> {
    await this.sandbox.delete();
  }
}
