/**
 * Preview launcher (artifact-preview capability): orchestrates a single demo —
 * pick a backend (docker by default, host on explicit opt-in), boot the built
 * app from a copy, health-check it within the cold-start budget, and route it to
 * a URL. Web targets get a live URL; non-web targets get a captured cold-start
 * run instead (no URL), with the artifact audit always available.
 */
import { DEFAULT_TRIAL_IMAGE } from "../providers/docker";
import {
	DockerBackend,
	freePort,
	HostBackend,
	type PreviewBackend,
	type StartedPreview,
	type TrustPosture,
} from "./backend";
import { type PreviewRouter, type Runner, selectRouter } from "./router";

export type PreviewStatus = "starting" | "ready" | "failed" | "stopped";

export interface LaunchOptions {
	previewId: string;
	workspaceDir: string;
	/** Web target → live URL; non-web → captured cold-start run, no URL. */
	web: boolean;
	/** Default false → docker (sandboxed). true → host execution (recorded). */
	unsafeHost?: boolean;
	router?: "port" | "portless";
	image?: string;
	/** Cold-start health-check budget. */
	budgetMs?: number;
	run?: Runner;
	log?: (m: string) => void;
}

export interface PreviewResult {
	status: "ready" | "failed";
	url: string | null;
	trust: TrustPosture;
	router: "port" | "portless";
	logs: { setup: string; start: string };
	stop(): Promise<void>;
}

const DEFAULT_BUDGET_MS = 90_000;

/** Poll `url` until it answers with HTTP < 500, or the budget elapses. */
export async function healthCheck(
	url: string,
	budgetMs = DEFAULT_BUDGET_MS,
	now: () => number = Date.now,
): Promise<boolean> {
	const deadline = now() + budgetMs;
	while (now() < deadline) {
		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(3000),
				redirect: "manual",
			});
			if (res.status < 500) return true;
		} catch {
			// not up yet
		}
		await sleep(1000);
	}
	return false;
}

function makeBackend(opts: LaunchOptions): PreviewBackend {
	if (opts.unsafeHost) return new HostBackend();
	return new DockerBackend(opts.image ?? DEFAULT_TRIAL_IMAGE);
}

/**
 * Launch a preview. On a web target: boot, health-check, expose a URL. On a
 * non-web target: run the cold-start, capture its logs, return no URL. A backend
 * that never becomes healthy is `failed` with its logs (itself useful audit
 * signal — "the build doesn't cold-start").
 */
export async function launchPreview(
	opts: LaunchOptions,
	backendOverride?: PreviewBackend,
): Promise<PreviewResult> {
	const run: Runner =
		opts.run ??
		(async () => ({ exitCode: 1, stdout: "", stderr: "no runner" }));
	const log = opts.log ?? (() => {});
	const backend = backendOverride ?? makeBackend(opts);
	const router: PreviewRouter = selectRouter(opts.router, run, log);
	const port = await freePort();

	let started: StartedPreview;
	try {
		started = await backend.start({ workspaceDir: opts.workspaceDir, port });
	} catch (e) {
		return {
			status: "failed",
			url: null,
			trust: backend.trust,
			router: router.id,
			logs: {
				setup: `[backend start failed] ${String(e).slice(0, 200)}`,
				start: "",
			},
			stop: async () => {},
		};
	}

	const teardown = async () => {
		await router.release(opts.previewId).catch(() => {});
		await started.stop().catch(() => {});
	};

	// Non-web target: the cold-start run IS the demo. No URL, no health poll.
	if (!opts.web) {
		// Give start.sh a moment to emit, then capture and tear down.
		await sleep(2000);
		const logs = { ...started.logs };
		await teardown();
		return {
			status: "ready",
			url: null,
			trust: backend.trust,
			router: router.id,
			logs,
			stop: async () => {},
		};
	}

	const directUrl = `http://${started.backend.host}:${started.backend.port}`;
	const healthy = await healthCheck(
		directUrl,
		opts.budgetMs ?? DEFAULT_BUDGET_MS,
	);
	if (!healthy) {
		const logs = { ...started.logs };
		await teardown();
		return {
			status: "failed",
			url: null,
			trust: backend.trust,
			router: router.id,
			logs,
			stop: async () => {},
		};
	}

	const { url } = await router.expose(opts.previewId, started.backend);
	return {
		status: "ready",
		url,
		trust: backend.trust,
		router: router.id,
		logs: { ...started.logs },
		stop: teardown,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
