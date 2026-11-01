/**
 * Docker egress lockdown for brownfield trials (add-brownfield-track D11, task 4.4).
 *
 * The trial container moves to a per-run `--internal` network: no route out, no
 * external DNS, no host access. A relay container sits on that network (alias
 * `gateway`) and on the default bridge, and forwards HTTP only to the run's model
 * gateway on the host. The relay's target is fixed at start, so a trial can't
 * point it anywhere else; the gateway enforces credential, model and tool policy.
 *
 * Setup that needs the network (installs) runs before `attach`; the agent runs after.
 */

import { cli } from "./cli-container";

export const RELAY_ALIAS = "gateway";
const RELAY_PORT = 8080;

/** Minimal HTTP relay run with the trial image's bun. TARGET is fixed per run. */
const RELAY_SCRIPT = `
const target = process.env.TARGET;
Bun.serve({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT),
  idleTimeout: 255,
  async fetch(req) {
    const u = new URL(req.url);
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
    let up;
    try {
      up = await fetch(target + u.pathname + u.search, { method: req.method, headers, body });
    } catch (e) {
      return new Response("relay: gateway unreachable", { status: 502 });
    }
    const out = new Headers(up.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(up.body, { status: up.status, headers: out });
  },
});
`;

export interface EgressLockOptions {
	runId: string;
	/** Image with bun for the relay (the trial image works). */
	image: string;
	/** Host port the model gateway listens on. */
	gatewayPort: number;
	binary?: string;
}

export class DockerEgressLock {
	readonly network: string;
	readonly relay: string;
	private binary: string;

	constructor(private opts: EgressLockOptions) {
		const id = opts.runId.replace(/[^a-zA-Z0-9_.-]/g, "-");
		this.network = `he-egress-${id}`;
		this.relay = `he-gwrelay-${id}`;
		this.binary = opts.binary ?? "docker";
	}

	/** Gateway base URL as seen from a locked trial container. */
	get baseUrl(): string {
		return `http://${RELAY_ALIAS}:${RELAY_PORT}`;
	}

	private async must(args: string[], what: string): Promise<string> {
		const r = await cli(this.binary, args, { timeoutMs: 60_000 });
		if (r.exitCode !== 0)
			throw new Error(`egress lock: ${what} failed: ${r.stderr.slice(0, 300)}`);
		return r.stdout;
	}

	async start(): Promise<void> {
		await this.stop(); // stale state from a crashed run
		await this.must(
			["network", "create", "--internal", this.network],
			"create internal network",
		);
		await this.must(
			[
				"run",
				"-d",
				"--name",
				this.relay,
				"--add-host=host.docker.internal:host-gateway",
				"-e",
				`TARGET=http://host.docker.internal:${this.opts.gatewayPort}`,
				"-e",
				`PORT=${RELAY_PORT}`,
				"--memory=256m",
				this.opts.image,
				"bun",
				"-e",
				RELAY_SCRIPT,
			],
			"start relay",
		);
		await this.must(
			["network", "connect", "--alias", RELAY_ALIAS, this.network, this.relay],
			"attach relay",
		);
	}

	/** Move a trial container onto the internal network; afterwards its only way out is the relay. */
	async attach(container: string): Promise<void> {
		await this.must(
			["network", "connect", this.network, container],
			"connect trial",
		);
		const nets = await this.must(
			[
				"inspect",
				"-f",
				"{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}",
				container,
			],
			"inspect trial networks",
		);
		for (const n of nets.trim().split(/\s+/))
			if (n && n !== this.network)
				await this.must(
					["network", "disconnect", "-f", n, container],
					`disconnect ${n}`,
				);
	}

	/** Best-effort teardown; never throws. */
	async stop(): Promise<void> {
		await cli(this.binary, ["rm", "-f", this.relay], { timeoutMs: 30_000 });
		await cli(this.binary, ["network", "rm", this.network], {
			timeoutMs: 30_000,
		});
	}
}

/**
 * Commands run inside a locked trial; each must FAIL for the lock to hold.
 * Used by the egress probe before any agent starts.
 */
export const EGRESS_LEAK_PROBES = [
	"curl -sS -m 5 -o /dev/null https://api.anthropic.com",
	"curl -sS -m 5 -o /dev/null https://pypi.org",
	"curl -sS -m 5 -o /dev/null http://1.1.1.1",
	"getent hosts github.com",
];
