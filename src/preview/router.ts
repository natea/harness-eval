/**
 * Pluggable preview routing (artifact-preview capability). A `PreviewRouter`
 * turns a started backend (host:port) into a reachable demo URL and owns the
 * routing lifecycle (`expose`/`release`).
 *
 * - `PortRouter` (default, zero-dependency): the mapped host port IS the route —
 *   return `http://localhost:<port>`.
 * - `PortlessRouter` (opt-in): register a stable `<run>-<trial>.localhost` name
 *   with the local portless proxy. Probes for portless; falls back to PortRouter
 *   with a logged note when it is absent, so a missing proxy never breaks demos.
 */

export interface Backend {
	host: string;
	port: number;
}

export interface PreviewRouter {
	readonly id: "port" | "portless";
	/** Register routing for a started backend; return the demo URL. */
	expose(previewId: string, backend: Backend): Promise<{ url: string }>;
	/** Tear down routing for a preview (idempotent). */
	release(previewId: string): Promise<void>;
}

/** A bounded command runner (injectable for tests). */
export type Runner = (
	binary: string,
	args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

/**
 * Sanitize a run+trial id into a DNS-safe portless hostname label: lowercase,
 * `[a-z0-9-]`, collapsed dashes, trimmed, length-capped. Deterministic.
 */
export function sanitizeName(runId: string, trialId: string): string {
	const raw = `${runId}-${trialId}`;
	const cleaned = raw
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	// DNS label max is 63 chars; keep a margin and a stable tail.
	return cleaned.slice(0, 50).replace(/-+$/g, "") || "preview";
}

/** Default: the mapped host port is the route. No external dependency. */
export class PortRouter implements PreviewRouter {
	readonly id = "port" as const;
	async expose(_previewId: string, backend: Backend): Promise<{ url: string }> {
		return { url: `http://localhost:${backend.port}` };
	}
	async release(_previewId: string): Promise<void> {
		// Nothing to release — the port belongs to the container/process teardown.
	}
}

/**
 * Opt-in: a stable `https://<run>-<trial>.localhost` URL via the portless proxy.
 * Registers an alias for the already-running backend; falls back to PortRouter
 * if portless is not installed.
 */
export class PortlessRouter implements PreviewRouter {
	readonly id = "portless" as const;
	private names = new Map<string, string>();

	constructor(
		private run: Runner,
		private log: (m: string) => void = () => {},
		private fallback: PreviewRouter = new PortRouter(),
	) {}

	async expose(previewId: string, backend: Backend): Promise<{ url: string }> {
		if (!(await isPortlessAvailable(this.run))) {
			this.log(
				"[preview] portless not found on PATH — falling back to port routing",
			);
			return this.fallback.expose(previewId, backend);
		}
		const name = sanitizeName(previewId, String(backend.port));
		const r = await this.run("portless", [
			"alias",
			name,
			String(backend.port),
		]);
		if (r.exitCode !== 0) {
			this.log(
				`[preview] portless alias failed (${r.stderr.slice(0, 120)}) — falling back to port routing`,
			);
			return this.fallback.expose(previewId, backend);
		}
		this.names.set(previewId, name);
		return { url: `https://${name}.localhost` };
	}

	async release(previewId: string): Promise<void> {
		const name = this.names.get(previewId);
		if (!name) return;
		this.names.delete(previewId);
		await this.run("portless", ["unalias", name]).catch(() => ({
			exitCode: 1,
			stdout: "",
			stderr: "",
		}));
	}
}

/** Probe whether the portless CLI is available on PATH. */
export async function isPortlessAvailable(run: Runner): Promise<boolean> {
	try {
		const r = await run("portless", ["--version"]);
		return r.exitCode === 0;
	} catch {
		return false;
	}
}

/** Select a router by config (`preview.router`). Defaults to port. */
export function selectRouter(
	router: "port" | "portless" | undefined,
	run: Runner,
	log?: (m: string) => void,
): PreviewRouter {
	return router === "portless"
		? new PortlessRouter(run, log)
		: new PortRouter();
}
