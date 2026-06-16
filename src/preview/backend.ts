/**
 * Preview execution backends (artifact-preview capability). A backend boots a
 * COPY of an archived trial's built app via its cold-start contract
 * (`setup.sh` then `start.sh` with an injected `PORT`) and exposes the listening
 * host:port — never running in `runs/.../workspace` (the immutable archive).
 *
 * - `DockerBackend` (default): isolate agent-generated code in a container with a
 *   mapped, localhost-bound port. Real isolation for untrusted code.
 * - `HostBackend` (`--unsafe-host` opt-in): run on the host bound to localhost.
 *   Faster, no container, but runs untrusted code directly — only for trusted
 *   local review of your own runs, and the trust posture is recorded.
 *
 * Both run setup.sh to completion (capturing its log), then launch start.sh
 * detached with output redirected to a file (the same daemon-holds-stdout hazard
 * the harness already guards against), and report the reachable backend.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type TrustPosture = "sandboxed" | "host-unsafe";

export interface StartedPreview {
	backend: { host: string; port: number };
	/** Captured cold-start logs. */
	logs: { setup: string; start: string };
	/** Tear down the running app + its ephemeral copy. Idempotent. */
	stop(): Promise<void>;
}

export interface PreviewBackend {
	readonly trust: TrustPosture;
	/**
	 * Copy the archived workspace, run the cold-start contract, and return the
	 * listening backend. `port` is the value injected as $PORT (the app is
	 * expected to listen on it).
	 */
	start(opts: {
		workspaceDir: string;
		port: number;
		env?: Record<string, string>;
	}): Promise<StartedPreview>;
}

/** Allocate a free localhost TCP port (best-effort; race window is small). */
export function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.once("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			srv.close(() => (port ? resolve(port) : reject(new Error("no port"))));
		});
	});
}

/**
 * Host backend (`--unsafe-host`): copies the workspace to a temp dir, runs
 * setup.sh there, then launches start.sh detached on the given port bound to
 * localhost. Runs untrusted code directly — caller must record the opt-in.
 */
export class HostBackend implements PreviewBackend {
	readonly trust = "host-unsafe" as const;

	async start(opts: {
		workspaceDir: string;
		port: number;
		env?: Record<string, string>;
	}): Promise<StartedPreview> {
		const dir = mkdtempSync(join(tmpdir(), "he-preview-"));
		cpSync(opts.workspaceDir, dir, { recursive: true });

		const env = {
			...process.env,
			...opts.env,
			PORT: String(opts.port),
			HOST: "127.0.0.1",
		};

		let setupLog = "";
		try {
			const r = await execFileAsync("bash", ["setup.sh"], {
				cwd: dir,
				env,
				timeout: 5 * 60_000,
				maxBuffer: 16 * 1024 * 1024,
			});
			setupLog = `${r.stdout}${r.stderr}`;
		} catch (e) {
			const err = e as { stdout?: string; stderr?: string };
			setupLog = `${err.stdout ?? ""}${err.stderr ?? ""}\n[setup.sh exited non-zero]`;
		}

		// start.sh detached; output redirected to a file so the inherited stdout
		// pipe can't hold us open (the hard-won daemon-stdout rule).
		const startLogPath = join(dir, ".preview-start.log");
		const child = spawn("bash", ["-lc", `exec ./start.sh > ${JSON.stringify(startLogPath)} 2>&1`], {
			cwd: dir,
			env,
			detached: true,
			stdio: "ignore",
		});
		child.unref();

		const stop = async () => {
			killGroup(child);
			rmSync(dir, { recursive: true, force: true });
		};

		return {
			backend: { host: "127.0.0.1", port: opts.port },
			logs: {
				setup: setupLog,
				get start() {
					try {
						return readFileSync(startLogPath, "utf8");
					} catch {
						return "";
					}
				},
			} as { setup: string; start: string },
			stop,
		};
	}
}

/**
 * Docker backend (default): runs the cold-start inside a container with the
 * app port published to a localhost host port. Isolates untrusted code.
 */
export class DockerBackend implements PreviewBackend {
	readonly trust = "sandboxed" as const;
	constructor(
		private image: string,
		private binary = "docker",
	) {}

	async start(opts: {
		workspaceDir: string;
		port: number;
		env?: Record<string, string>;
	}): Promise<StartedPreview> {
		const name = `he-preview-${Date.now().toString(36)}`;
		const containerPort = opts.port;
		const run = (args: string[], timeoutMs = 60_000) =>
			execFileAsync(this.binary, args, {
				timeout: timeoutMs,
				maxBuffer: 16 * 1024 * 1024,
			}).then(
				(r) => ({ code: 0, out: `${r.stdout}${r.stderr}` }),
				(e) => ({ code: 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }),
			);

		const envFlags = Object.entries({ ...opts.env, HOST: "0.0.0.0" }).flatMap(
			([k, v]) => ["-e", `${k}=${v}`],
		);
		// Publish to a random localhost host port; container app listens on $PORT.
		await run([
			"run",
			"-d",
			"--name",
			name,
			"-e",
			`PORT=${containerPort}`,
			...envFlags,
			"-p",
			`127.0.0.1:0:${containerPort}`,
			this.image,
			"sleep",
			"infinity",
		]);
		await run(["cp", `${opts.workspaceDir}/.`, `${name}:/app`]);

		const setup = await run(
			["exec", "-w", "/app", name, "bash", "setup.sh"],
			5 * 60_000,
		);
		// start.sh detached inside the container, output to a file.
		await run([
			"exec",
			"-d",
			"-w",
			"/app",
			name,
			"bash",
			"-lc",
			"exec ./start.sh > /tmp/start.log 2>&1",
		]);

		// Resolve the mapped host port.
		const portRes = await run(["port", name, String(containerPort)]);
		const hostPort = Number(portRes.out.trim().split(":").pop()) || containerPort;

		const stop = async () => {
			await run(["rm", "-f", name]);
		};

		return {
			backend: { host: "127.0.0.1", port: hostPort },
			logs: {
				setup: setup.out,
				get start() {
					return ""; // pulled lazily via `docker exec cat` if needed
				},
			} as { setup: string; start: string },
			stop,
		};
	}
}

function killGroup(child: ChildProcess): void {
	if (child.pid === undefined) return;
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		try {
			child.kill("SIGKILL");
		} catch {
			// already gone
		}
	}
}
