/**
 * Preview lifecycle manager (artifact-preview capability). Tracks running demos
 * like studio jobs (`starting → ready | failed → stopped`), enforces a
 * concurrency cap, auto-stops idle previews, and guarantees leak-free teardown
 * (the running app + its router route) on stop / idle / process exit.
 */
import { type LaunchOptions, type PreviewResult, launchPreview } from "./launcher";

export type PreviewState = "starting" | "ready" | "failed" | "stopped";

export interface PreviewRecord {
	id: string;
	runId: string;
	trialId: string;
	state: PreviewState;
	url: string | null;
	trust: "sandboxed" | "host-unsafe";
	router: "port" | "portless";
	target: string;
	startedAt: string;
	error?: string;
}

export interface ManagerOptions {
	/** Max simultaneous previews (each holds a container/port). */
	maxConcurrent?: number;
	/** Auto-stop a preview with no access for this long. */
	idleMs?: number;
	log?: (m: string) => void;
	now?: () => string;
}

interface Active {
	record: PreviewRecord;
	stop: () => Promise<void>;
	idleTimer?: ReturnType<typeof setTimeout>;
}

export class PreviewManager {
	private active = new Map<string, Active>();
	private maxConcurrent: number;
	private idleMs: number;
	private log: (m: string) => void;
	private now: () => string;

	constructor(opts: ManagerOptions = {}) {
		this.maxConcurrent = opts.maxConcurrent ?? 3;
		this.idleMs = opts.idleMs ?? 15 * 60_000;
		this.log = opts.log ?? (() => {});
		this.now = opts.now ?? (() => new Date().toISOString());
	}

	list(): PreviewRecord[] {
		return [...this.active.values()].map((a) => a.record);
	}

	get(id: string): PreviewRecord | undefined {
		return this.active.get(id)?.record;
	}

	/** Reset the idle timer (call when the demo is accessed). */
	touch(id: string): void {
		const a = this.active.get(id);
		if (a && a.record.state === "ready") this.armIdle(id);
	}

	/**
	 * Start a preview for a trial. Refuses (logged, not silently dropped) when the
	 * concurrency cap is reached. The launch runs to ready/failed; the record is
	 * updated in place.
	 */
	async start(
		runId: string,
		trialId: string,
		target: string,
		launch: LaunchOptions,
		runLaunch: typeof launchPreview = launchPreview,
	): Promise<PreviewRecord | { refused: string }> {
		const readyOrStarting = [...this.active.values()].filter(
			(a) => a.record.state === "starting" || a.record.state === "ready",
		).length;
		if (readyOrStarting >= this.maxConcurrent) {
			const msg = `preview refused: at concurrency cap (${this.maxConcurrent}); stop a running demo first`;
			this.log(`[preview] ${msg}`);
			return { refused: msg };
		}

		const id = launch.previewId;
		const record: PreviewRecord = {
			id,
			runId,
			trialId,
			state: "starting",
			url: null,
			trust: launch.unsafeHost ? "host-unsafe" : "sandboxed",
			router: launch.router ?? "port",
			target,
			startedAt: this.now(),
		};
		this.active.set(id, { record, stop: async () => {} });

		let res: PreviewResult;
		try {
			res = await runLaunch(launch);
		} catch (e) {
			record.state = "failed";
			record.error = String(e).slice(0, 200);
			return record;
		}

		record.state = res.status; // "ready" | "failed"
		record.url = res.url;
		record.trust = res.trust;
		record.router = res.router;
		const entry = this.active.get(id);
		if (entry) entry.stop = res.stop;

		if (res.status === "ready") this.armIdle(id);
		return record;
	}

	/** Stop a preview: teardown app + router route, mark stopped, drop tracking. */
	async stop(id: string): Promise<{ ok: boolean }> {
		const a = this.active.get(id);
		if (!a) return { ok: false };
		if (a.idleTimer) clearTimeout(a.idleTimer);
		await a.stop().catch(() => {});
		a.record.state = "stopped";
		this.active.delete(id);
		return { ok: true };
	}

	/** Tear down every preview (process exit / shutdown) — no leaks. */
	async stopAll(): Promise<void> {
		await Promise.all([...this.active.keys()].map((id) => this.stop(id)));
	}

	private armIdle(id: string): void {
		const a = this.active.get(id);
		if (!a) return;
		if (a.idleTimer) clearTimeout(a.idleTimer);
		a.idleTimer = setTimeout(() => {
			this.log(`[preview] ${id} idle for ${this.idleMs / 60_000}m — auto-stopping`);
			void this.stop(id);
		}, this.idleMs);
		// Don't keep the event loop alive on this timer alone.
		(a.idleTimer as { unref?: () => void }).unref?.();
	}
}
