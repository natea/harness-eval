/**
 * Live build stream — read-only tap (live-build-stream capability).
 *
 * While the harness session writes its JSONL to the sandbox file, this reads new
 * COMPLETE lines incrementally and turns them into redacted, append-only turns
 * using the SAME `transcript-render` parser as the post-hoc replay (single-parser
 * invariant). It never writes to the sandbox and never attaches to the build
 * process's stdout — it only reads the file the driver already redirects to, via a
 * short-lived `tail` (not `tail -f`), so the daemon-stdout footgun is avoided and
 * the post-exit read + archived transcript stay byte-identical.
 */
import type { Sandbox } from "../providers/types";
import { collectSecretValues, redactSecrets } from "../driver/archive";
import { type Turn, parseTranscript } from "../report/transcript-render";

/** Reads session lines from a 1-indexed start line to EOF (may end mid-line). */
export interface LineReader {
	read(fromLine: number): Promise<string>;
}

/**
 * A provider-agnostic reader over the driver's output file: `tail -n +N` reads
 * from line N to EOF in one short-lived exec (read-only; exits immediately so it
 * cannot hold the build's stdout open). Works on every provider via `exec`.
 */
export function sandboxLineReader(sandbox: Sandbox, path: string): LineReader {
	const quoted = JSON.stringify(path);
	return {
		async read(fromLine: number): Promise<string> {
			const res = await sandbox.exec(
				`tail -n +${fromLine} ${quoted} 2>/dev/null || true`,
				{ timeoutMs: 15_000 },
			);
			return res.stdout;
		},
	};
}

/** Redact a turn's strings with the archiver's rules (env values + patterns). */
export function redactTurn(turn: Turn, secretValues: string[]): Turn {
	const { text } = redactSecrets(JSON.stringify(turn), secretValues);
	try {
		return JSON.parse(text) as Turn;
	} catch {
		return turn; // never emit malformed JSON; fall back to the original
	}
}

/**
 * Incremental turn stream over a `LineReader`. Each `poll()` consumes only
 * newly-COMPLETE lines (a partial trailing line is held until its newline
 * arrives), re-parses the accumulated complete text with the shared parser
 * (monotonic — appending complete lines only appends turns), and returns the
 * NEW turns since the previous poll, redacted.
 */
export class LiveTurnStream {
	private completeLines = 0;
	private accumulated = "";
	private emitted = 0;

	constructor(
		private readonly reader: LineReader,
		private readonly secretValues: string[] = collectSecretValues(),
	) {}

	/** Total turns emitted so far (for handoff dedupe). */
	get emittedCount(): number {
		return this.emitted;
	}

	async poll(): Promise<Turn[]> {
		const raw = await this.reader.read(this.completeLines + 1);
		if (!raw) return [];
		const endsWithNewline = raw.endsWith("\n");
		const parts = raw.split("\n");
		// Drop the trailing element: "" after a final newline, or an incomplete
		// partial line still being written — held until its newline arrives.
		parts.pop();
		if (!endsWithNewline && parts.length === 0) return [];
		if (parts.length === 0) return [];
		this.completeLines += parts.length;
		this.accumulated += (this.accumulated ? "\n" : "") + parts.join("\n");
		const turns = parseTranscript(this.accumulated);
		const fresh = turns.slice(this.emitted);
		this.emitted = turns.length;
		return fresh.map((t) => redactTurn(t, this.secretValues));
	}
}
