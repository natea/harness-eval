/**
 * Studio live build stream (live-build-stream): a localhost SSE endpoint that
 * streams an in-progress trial's parsed, redacted turns as they are written, then
 * signals `done` so the client can hand off to the archived replay. Reads only
 * via the live registry's read-only tap — never mutates anything.
 */
import { join } from "node:path";
import { getLiveSource } from "../live/registry";
import { LiveTurnStream, fileLineReader } from "../live/tap";
import { readRunState } from "./run-state";
import { trialTranscript } from "./transcript";

const POLL_MS = 700;
// Grace after the run is no longer running (terminal but not yet archived) before
// giving up — covers the brief session-end → archival gap. While the run is still
// running (e.g. a long framework install before the agent writes anything), the
// stream keeps waiting regardless, capped only by MAX_TICKS.
const MAX_IDLE_TICKS = 30; // ~21s
const MAX_TICKS = Math.ceil((30 * 60_000) / POLL_MS); // ~30 min safety cap

/** SSE Response streaming live turns for a building trial. */
export function liveStreamResponse(runId: string, trialId: string): Response {
	const encoder = new TextEncoder();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let closed = false;
	let currentFile: string | undefined; // outFile currently being tailed
	let stream: LiveTurnStream | undefined;
	let idle = 0;
	let ticks = 0;

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (obj: unknown): boolean => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
					return true;
				} catch {
					return false; // client disconnected
				}
			};
			const close = (final?: unknown) => {
				if (closed) return;
				closed = true;
				if (final) send(final);
				if (timer) clearTimeout(timer);
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};

			// Already finished (or never live) but archived → hand straight off.
			if (!getLiveSource(trialId) && trialTranscript(runId, trialId)) {
				close({ type: "done", reason: "archived" });
				return;
			}
			if (!send({ type: "open" })) return close();

			const tick = async () => {
				if (closed) return;
				ticks++;
				if (ticks > MAX_TICKS) return close({ type: "done", reason: "max-duration" });
				try {
					const src = getLiveSource(trialId);
					// Only host-local files are tailable from this (separate) process;
					// remote-sandbox streaming is a push follow-up.
					const tailable = src?.local ? src : undefined;
					if (tailable && tailable.outFile !== currentFile) {
						currentFile = tailable.outFile; // new step/file
						stream = new LiveTurnStream(fileLineReader(tailable.outFile));
					}
					if (tailable && stream) {
						const fresh = await stream.poll();
						if (fresh.length) {
							idle = 0;
							if (!send({ type: "turns", turns: fresh })) return close();
						}
					}
					if (!tailable) {
						// Archived → hand off immediately.
						if (trialTranscript(runId, trialId)) return close({ type: "done" });
						// Still running (installing / between steps / agent starting up) →
						// keep waiting; the agent just hasn't written yet.
						const rs = readRunState(join("runs", runId));
						if (rs?.status === "running") {
							idle = 0;
						} else {
							// Terminal but not yet archived → wait out the brief gap, then stop.
							idle++;
							if (idle > MAX_IDLE_TICKS)
								return close({ type: "done", reason: "idle" });
						}
					}
				} catch {
					// transient read error — keep polling
				}
				if (!closed) timer = setTimeout(tick, POLL_MS);
			};
			timer = setTimeout(tick, POLL_MS);
		},
		cancel() {
			closed = true;
			if (timer) clearTimeout(timer);
		},
	});

	return new Response(body, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	});
}
