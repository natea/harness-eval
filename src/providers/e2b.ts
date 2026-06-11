import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { Sandbox as E2BSandbox } from "e2b";
import type {
	ExecOptions,
	ExecResult,
	PreflightContext,
	Sandbox,
	SandboxProvider,
} from "./types";
import { PreflightError } from "./types";

const WORKSPACE = "/home/ubuntu/workspace";

/** Hobby-tier max sandbox lifetime; Pro is higher (e2b change D2). */
const TIER_LIFETIME_MS: Record<string, number> = {
	hobby: 60 * 60 * 1000,
	pro: 24 * 60 * 60 * 1000,
};

export interface E2BProviderOptions {
	template: string;
	/** Account tier for preflight lifetime validation. */
	tier?: "hobby" | "pro";
	/** Setup margin added to the trial budget when sizing sandbox lifetime. */
	setupMarginMs?: number;
}

/**
 * E2B cloud provider (e2b change D1/D2): Firecracker sandboxes from a pinned
 * template; explicit lifetime management with heartbeat extension.
 */
export class E2BProvider implements SandboxProvider {
	readonly id = "e2b" as const;
	readonly snapshotId: string;
	private lifetimeMs = 0;

	constructor(private opts: E2BProviderOptions) {
		if (!process.env.E2B_API_KEY)
			throw new PreflightError("E2B_API_KEY is not set");
		this.snapshotId = opts.template;
	}

	async preflight(ctx: PreflightContext): Promise<void> {
		const tier = this.opts.tier ?? "hobby";
		const cap = TIER_LIFETIME_MS[tier] ?? TIER_LIFETIME_MS.hobby!;
		this.lifetimeMs =
			ctx.trialWallClockMs + (this.opts.setupMarginMs ?? 15 * 60 * 1000);
		if (this.lifetimeMs > cap) {
			throw new PreflightError(
				`E2B ${tier} tier max sandbox lifetime ${(cap / 3.6e6).toFixed(1)}h < required ${(this.lifetimeMs / 3.6e6).toFixed(1)}h (trial budget + setup margin) — upgrade tier or reduce budget.trialWallClockMs`,
			);
		}
		// Template existence: create/kill is the only universal check; do a
		// short-lived probe so a bad template fails here, not mid-matrix.
		try {
			const probe = await E2BSandbox.create(this.opts.template, {
				timeoutMs: 60_000,
			});
			await probe.kill();
		} catch (err) {
			throw new PreflightError(
				`E2B template '${this.opts.template}' failed to start: ${String(err).slice(0, 200)} — build it per infra/e2b-template/README.md`,
			);
		}
	}

	async provision(trialId: string): Promise<Sandbox> {
		const cap =
			TIER_LIFETIME_MS[this.opts.tier ?? "hobby"] ?? TIER_LIFETIME_MS.hobby!;
		const lifetime =
			this.lifetimeMs > 0 ? this.lifetimeMs : Math.min(2 * 60 * 60 * 1000, cap);
		const sandbox = await E2BSandbox.create(this.opts.template, {
			timeoutMs: lifetime,
			metadata: { "harness-eval/trial": trialId },
		});
		await sandbox.commands.run(`mkdir -p ${WORKSPACE}`);
		return new E2BTrialSandbox(sandbox, trialId, lifetime);
	}
}

class E2BTrialSandbox implements Sandbox {
	readonly id: string;
	readonly workspacePath = WORKSPACE;

	constructor(
		private sandbox: E2BSandbox,
		trialId: string,
		private lifetimeMs: number,
	) {
		this.id = `e2b:${sandbox.sandboxId}:${trialId}`;
	}

	async exec(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
		// Heartbeat: long session steps must not outlive the sandbox (D2).
		if (this.lifetimeMs > 0)
			await this.sandbox.setTimeout(this.lifetimeMs).catch(() => {});
		try {
			const res = await this.sandbox.commands.run(command, {
				cwd: opts.cwd ?? this.workspacePath,
				envs: opts.env,
				timeoutMs: opts.timeoutMs ?? 120_000,
			});
			return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr };
		} catch (err) {
			const e = err as { exitCode?: number; stdout?: string; stderr?: string };
			return {
				exitCode: e.exitCode ?? 1,
				stdout: e.stdout ?? "",
				stderr: e.stderr ?? String(err),
			};
		}
	}

	async copyOut(sandboxPath: string, hostDest: string): Promise<void> {
		mkdirSync(hostDest, { recursive: true });
		const tarPath = "/tmp/he-out.tar.gz";
		const tar = await this.exec(
			`tar -czf ${tarPath} -C ${JSON.stringify(sandboxPath)} .`,
			{ timeoutMs: 300_000 },
		);
		if (tar.exitCode !== 0)
			throw new Error(`tar failed in e2b sandbox: ${tar.stderr}`);
		const bytes = await this.sandbox.files.read(tarPath, { format: "bytes" });
		const local = join(tmpdir(), `he-e2b-${Date.now()}.tar.gz`);
		writeFileSync(local, Buffer.from(bytes));
		execFileSync("tar", ["-xzf", local, "-C", hostDest]);
		rmSync(local, { force: true });
	}

	async writeFile(sandboxPath: string, content: string): Promise<void> {
		const dest = isAbsolute(sandboxPath)
			? sandboxPath
			: join(this.workspacePath, sandboxPath);
		await this.exec(`mkdir -p ${JSON.stringify(dirname(dest))}`);
		await this.sandbox.files.write(dest, content);
	}

	async destroy(): Promise<void> {
		await this.sandbox.kill();
	}
}
