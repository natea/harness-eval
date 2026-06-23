/**
 * Cross-process registry of in-progress trial sessions (live-build-stream).
 *
 * Real runs execute in a DETACHED run-worker process (crash durability), so the
 * studio HTTP process can't share memory with the build. The worker therefore
 * drops a small pointer file on shared local disk naming the session's output
 * file; the studio's SSE endpoint reads it and tails that file. `local` marks a
 * host-readable file (worktree provider) — the only case the HTTP process can
 * tail directly; remote-sandbox files need a push transport (follow-up).
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

const DIR = "/tmp/he-live";

export interface LiveSource {
	/** Absolute path of the session's JSONL output. */
	outFile: string;
	/** True when `outFile` is on the host filesystem (worktree provider). */
	local: boolean;
	/** Provider sandbox id, e.g. `docker:he-bare-t1`; used for local container tails. */
	sandboxId?: string;
}

/** Bare trial id from a sandbox id (e.g. `worktree:gsd-t1` → `gsd-t1`). */
export function trialIdFromSandbox(sandboxId: string): string {
	const i = sandboxId.indexOf(":");
	return i >= 0 ? sandboxId.slice(i + 1) : sandboxId;
}

function pointerPath(trialId: string): string {
	return join(DIR, `${trialId.replace(/[^a-zA-Z0-9_.-]/g, "_")}.json`);
}

export function registerLiveSource(trialId: string, source: LiveSource): void {
	try {
		mkdirSync(DIR, { recursive: true });
		writeFileSync(pointerPath(trialId), JSON.stringify(source));
	} catch {
		// best-effort; never affect the build
	}
}

export function unregisterLiveSource(trialId: string): void {
	try {
		rmSync(pointerPath(trialId), { force: true });
	} catch {
		// ignore
	}
}

export function getLiveSource(trialId: string): LiveSource | undefined {
	try {
		const p = pointerPath(trialId);
		if (!existsSync(p)) return undefined;
		return JSON.parse(readFileSync(p, "utf8")) as LiveSource;
	} catch {
		return undefined;
	}
}
