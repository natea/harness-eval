import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Daytona, type Sandbox as DaytonaSandbox } from "@daytonaio/sdk";
import type {
	ExecOptions,
	ExecResult,
	PreflightContext,
	Sandbox,
	SandboxProvider,
} from "./types";
import { PreflightError } from "./types";

const WORKSPACE = "/home/ubuntu/workspace";

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

	async preflight(ctx: PreflightContext): Promise<void> {
		if (!ctx.requiredProbe) return;
		const probe = await this.provision(`preflight-${Date.now().toString(36)}`);
		try {
			const res = await probe.exec(ctx.requiredProbe.command, {
				timeoutMs: 60_000,
			});
			if (res.exitCode !== 0) {
				throw new PreflightError(
					`Daytona snapshot '${this.snapshotId}' failed ${ctx.requiredProbe.label} probe: ${(res.stderr || res.stdout).slice(0, 300)}`,
				);
			}
		} finally {
			await probe.destroy().catch(() => {});
		}
	}

	private async sweepStaleTrialSandboxes(trialId: string): Promise<void> {
		try {
			const list = (await (this.client as unknown as { list: () => Promise<unknown> }).list()) as
				| Array<{ id: string; state?: string; labels?: Record<string, string>; delete: () => Promise<void> }>
				| { items?: Array<{ id: string; state?: string; labels?: Record<string, string>; delete: () => Promise<void> }> };
			const items = Array.isArray(list) ? list : (list.items ?? []);
			for (const sb of items) {
				const label = sb.labels?.["harness-eval/trial"];
				if (!label) continue; // never touch non-trial sandboxes (orchestrator!)
				if (String(sb.state ?? "").toLowerCase().includes("start")) {
					console.warn(`[daytona] sweeping stale trial sandbox ${sb.id} (${label}) before provisioning ${trialId}`);
					await sb.delete().catch(() => {});
				}
			}
		} catch {
			// sweep is best-effort; create() will surface real quota errors
		}
	}

	async provision(trialId: string): Promise<Sandbox> {
		// Quota guard: provider-side accounting lags deletes, and a wedged
		// teardown can strand a sandbox that eats the org memory cap. Sweep
		// our own stale trial sandboxes, then wait for quota headroom.
		await this.sweepStaleTrialSandboxes(trialId);
		const sandbox = await this.client.create({
			snapshot: this.snapshotId,
			labels: { "harness-eval/trial": trialId },
			// Long unattended builds: never auto-stop mid-trial.
			autoStopInterval: 0,
		});
		// The snapshot's USER owns the workspace, but Daytona's upload daemon
		// may run as a different uid — open permissions so fs.uploadFile works.
		await sandbox.process.executeCommand(
			`sudo mkdir -p ${WORKSPACE} && sudo chmod -R 0777 ${WORKSPACE} || (mkdir -p ${WORKSPACE} && chmod -R 0777 ${WORKSPACE})`,
		);
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
		// Export vars then run via bash -c so env reaches EVERY command in a
		// pipeline (plain `env K=V cmd1 | cmd2` only affects cmd1).
		const exports = opts.env
			? Object.entries(opts.env)
					.map(([k, v]) => `export ${k}=${JSON.stringify(v)};`)
					.join(" ")
			: "";
		const wrapped = exports
			? `bash -lc ${JSON.stringify(`${exports} ${command}`)}`
			: command;
		const timeoutSec = opts.timeoutMs
			? Math.ceil(opts.timeoutMs / 1000)
			: undefined;
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
		if (tar.exitCode !== 0)
			throw new Error(`tar failed in sandbox: ${tar.stdout}`);
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
