import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type {
	ExecOptions,
	ExecResult,
	PreflightContext,
	ProviderId,
	Sandbox,
	SandboxProvider,
} from "./types";
import { PreflightError } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Verb table for an OCI-style container CLI. Docker and Apple's `container`
 * share the same verb shapes; behavioral differences stay in this table so
 * the two providers cannot drift apart structurally (docker change D1,
 * macos-vz change D4).
 */
export interface ContainerCliSpec {
	providerId: ProviderId;
	binary: string;
	/** Extra args for `run` beyond image+command (resource limits etc.). */
	runArgs: (limits: ResourceLimits) => string[];
	/** Daemon/services health args (default ["info"]; Apple: ["system","status"]). */
	infoArgs?: string[];
	/** CLIs without a `cp` verb copy via exec+base64 streams instead. */
	execCopy?: boolean;
	/** Verify host support; throw PreflightError with remediation if unmet. */
	platformCheck?: () => Promise<void>;
}

export interface ResourceLimits {
	memoryGb: number;
	cpus: number;
}

const WORKSPACE = "/home/ubuntu/workspace";

export async function cli(
	binary: string,
	args: string[],
	opts: { timeoutMs?: number; input?: string } = {},
): Promise<ExecResult> {
	try {
		const { stdout, stderr } = await execFileAsync(binary, args, {
			timeout: opts.timeoutMs ?? 120_000,
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

/** Shared implementation for CLI-driven container providers (docker, macos-vz). */
export class CliContainerProvider implements SandboxProvider {
	readonly id: ProviderId;
	readonly snapshotId: string;

	constructor(
		private spec: ContainerCliSpec,
		private image: string,
		private limits: ResourceLimits,
	) {
		this.id = spec.providerId;
		this.snapshotId = image;
	}

	async preflight(ctx: PreflightContext): Promise<void> {
		await this.spec.platformCheck?.();
		const info = await cli(this.spec.binary, this.spec.infoArgs ?? ["info"], {
			timeoutMs: 15_000,
		});
		if (info.exitCode !== 0) {
			throw new PreflightError(
				`${this.spec.binary} daemon/services unreachable (is it running?): ${info.stderr.slice(0, 200)}`,
			);
		}
		const img = await cli(this.spec.binary, ["image", "inspect", this.image], {
			timeoutMs: 15_000,
		});
		if (img.exitCode !== 0) {
			throw new PreflightError(
				`image '${this.image}' not found — build it with:\n  ${this.spec.binary} build -t ${this.image} infra/trial-image/`,
			);
		}
		const hostGb = require("node:os").totalmem() / 1024 ** 3;
		const needGb = this.limits.memoryGb * ctx.concurrency;
		if (needGb > hostGb * 0.8) {
			console.warn(
				`[${this.id}] warning: ${ctx.concurrency} × ${this.limits.memoryGb}GiB trials ≈ ${needGb}GiB vs ${hostGb.toFixed(0)}GiB host RAM`,
			);
		}
	}

	async provision(trialId: string): Promise<Sandbox> {
		const name = `he-${trialId}`;
		// Stale container from a crashed prior run: remove before starting fresh.
		const stale = await cli(this.spec.binary, ["rm", "-f", name]);
		const staleRemoved = stale.exitCode === 0 && stale.stdout.trim().length > 0;
		const run = await cli(this.spec.binary, [
			"run",
			"-d",
			"--name",
			name,
			...this.spec.runArgs(this.limits),
			this.image,
			"sleep",
			"infinity",
		]);
		if (run.exitCode !== 0) {
			throw new Error(
				`${this.spec.binary} run failed (provision): ${run.stderr.slice(0, 400)}`,
			);
		}
		await cli(this.spec.binary, ["exec", name, "mkdir", "-p", WORKSPACE]);
		return new CliContainerSandbox(this.spec, name, this.id, staleRemoved);
	}
}

class CliContainerSandbox implements Sandbox {
	readonly id: string;
	readonly workspacePath = WORKSPACE;
	/** Surfaced so the scheduler can note stale-recovery in provenance. */
	readonly staleRecovered: boolean;

	private binary: string;

	constructor(
		private spec: ContainerCliSpec,
		private name: string,
		providerId: ProviderId,
		staleRecovered: boolean,
	) {
		this.binary = spec.binary;
		this.id = `${providerId}:${this.name}`;
		this.staleRecovered = staleRecovered;
	}

	async exec(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
		const envArgs = Object.entries(opts.env ?? {}).flatMap(([k, v]) => [
			"-e",
			`${k}=${v}`,
		]);
		return cli(
			this.binary,
			[
				"exec",
				"-w",
				opts.cwd ?? this.workspacePath,
				...envArgs,
				this.name,
				"bash",
				"-lc",
				command,
			],
			{ timeoutMs: opts.timeoutMs },
		);
	}

	async copyOut(sandboxPath: string, hostDest: string): Promise<void> {
		mkdirSync(hostDest, { recursive: true });
		const src = isAbsolute(sandboxPath)
			? sandboxPath
			: join(this.workspacePath, sandboxPath);
		if (this.spec.execCopy) {
			// No cp verb: stream a base64 tarball over the exec channel.
			const res = await this.exec(
				`tar -czf - -C ${JSON.stringify(src)} . | base64`,
				{ timeoutMs: 300_000 },
			);
			if (res.exitCode !== 0)
				throw new Error(`exec-copy out failed: ${res.stderr.slice(0, 300)}`);
			const tarBytes = Buffer.from(res.stdout.replace(/\s/g, ""), "base64");
			const tmp = join(
				require("node:os").tmpdir(),
				`he-vz-${Date.now()}.tar.gz`,
			);
			require("node:fs").writeFileSync(tmp, tarBytes);
			require("node:child_process").execFileSync("tar", [
				"-xzf",
				tmp,
				"-C",
				hostDest,
			]);
			require("node:fs").rmSync(tmp, { force: true });
			return;
		}
		// `cp container:dir/. host/` copies contents, mirroring the other providers.
		const res = await cli(
			this.binary,
			["cp", `${this.name}:${src}/.`, hostDest],
			{
				timeoutMs: 300_000,
			},
		);
		if (res.exitCode !== 0)
			throw new Error(
				`${this.binary} cp out failed: ${res.stderr.slice(0, 300)}`,
			);
	}

	async writeFile(sandboxPath: string, content: string): Promise<void> {
		const dest = isAbsolute(sandboxPath)
			? sandboxPath
			: join(this.workspacePath, sandboxPath);
		await this.exec(`mkdir -p ${JSON.stringify(dirname(dest))}`);
		if (this.spec.execCopy) {
			const b64 = Buffer.from(content, "utf8").toString("base64");
			// Chunk to stay well under argv limits for large files (SPEC.md ~80KB).
			await this.exec(`: > ${JSON.stringify(dest)}.b64`);
			for (let i = 0; i < b64.length; i += 65536) {
				const chunk = b64.slice(i, i + 65536);
				const r = await this.exec(
					`printf %s ${JSON.stringify(chunk)} >> ${JSON.stringify(dest)}.b64`,
				);
				if (r.exitCode !== 0)
					throw new Error(`exec-copy chunk failed: ${r.stderr.slice(0, 200)}`);
			}
			const fin = await this.exec(
				`base64 -d ${JSON.stringify(dest)}.b64 > ${JSON.stringify(dest)} && rm ${JSON.stringify(dest)}.b64`,
			);
			if (fin.exitCode !== 0)
				throw new Error(`exec-copy decode failed: ${fin.stderr.slice(0, 200)}`);
			return;
		}
		const tmp = join(
			require("node:os").tmpdir(),
			`he-cp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		require("node:fs").writeFileSync(tmp, content);
		const res = await cli(this.binary, ["cp", tmp, `${this.name}:${dest}`], {
			timeoutMs: 60_000,
		});
		require("node:fs").rmSync(tmp, { force: true });
		if (res.exitCode !== 0)
			throw new Error(
				`${this.binary} cp in failed: ${res.stderr.slice(0, 300)}`,
			);
	}

	async destroy(): Promise<void> {
		await cli(this.binary, ["rm", "-f", this.name]);
	}
}
