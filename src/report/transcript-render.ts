/**
 * Trial transcript renderer (trial-transcript-audit). Pure function of the
 * archived Claude Code `stream-json` session files — adds no new capture path,
 * so it renders correctly for every already-archived run.
 *
 * The raw `transcripts/session-NNN.jsonl` is the unabridged ground truth; this
 * turns it into a readable, role/direction-tagged conversation where a REQUEST
 * (agent-issued prompt or tool call) is unambiguously distinct from a RESPONSE
 * (tool result or model output). Used both to emit `conversation.md` at archive
 * time and to feed the studio Conversation replay tab (one parser, no drift).
 *
 * Observed event shape (stream-json, one JSON object per line):
 *   - system          → bootstrap/periodic noise (dropped); `subtype:"init"`
 *                        surfaced once as a compact header (model, cwd, tools)
 *   - assistant        → message.content blocks: `thinking`, `text`, `tool_use`
 *   - user             → message.content blocks: `tool_result` (response), or
 *                        plain text (a typed prompt)
 *   - rate_limit_event → dropped
 *   - result           → terminal summary (status, duration, cost, usage)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Largest inline payload (bytes) before the Markdown truncates it. The raw
 *  `.jsonl` is never truncated, so ground truth is preserved. */
export const MAX_INLINE = 4096;

export type Direction = "request" | "response" | "info";

export type Turn =
	| {
			kind: "init";
			dir: "info";
			model: string;
			cwd?: string;
			tools: string[];
	  }
	| { kind: "prompt"; dir: "request"; role: "user"; text: string }
	| { kind: "thinking"; dir: "info"; role: "assistant"; text: string }
	| { kind: "assistant"; dir: "response"; role: "assistant"; text: string }
	| {
			kind: "tool_use";
			dir: "request";
			role: "assistant";
			id: string;
			tool: string;
			input: unknown;
	  }
	| {
			kind: "tool_result";
			dir: "response";
			role: "tool";
			forId: string;
			tool?: string;
			output: string;
			isError: boolean;
	  }
	| {
			kind: "result";
			dir: "info";
			role: "system";
			status: string;
			durationMs: number;
			costUsd: number;
			numTurns: number;
			usage?: { inputTokens: number; outputTokens: number };
	  };

type Block = Record<string, unknown> & { type?: string };

/** Normalize a tool_result `content` (string | block[] | other) to plain text. */
function resultText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((b) => {
				const block = b as Block;
				if (typeof block?.text === "string") return block.text;
				if (block?.type) return `[${String(block.type)}]`;
				return typeof b === "string" ? b : JSON.stringify(b);
			})
			.join("\n");
	}
	if (content == null) return "";
	return JSON.stringify(content);
}

/**
 * Parse one session's stream-json into ordered, role/direction-tagged turns.
 * Bootstrap `system` noise is dropped; the single `init` event becomes a
 * compact header. Tool calls (`tool_use`) and their results (`tool_result`) are
 * linked by id and the result inherits the call's tool name for labeling.
 */
export function parseTranscript(jsonl: string): Turn[] {
	const turns: Turn[] = [];
	const toolNameById = new Map<string, string>();
	for (const line of jsonl.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		let o: Record<string, unknown>;
		try {
			o = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			continue; // non-JSON noise in the stream
		}
		const type = o.type as string | undefined;

		if (type === "system") {
			if (o.subtype === "init") {
				turns.push({
					kind: "init",
					dir: "info",
					model: String(o.model ?? "unknown"),
					cwd: typeof o.cwd === "string" ? o.cwd : undefined,
					tools: Array.isArray(o.tools) ? (o.tools as string[]) : [],
				});
			}
			continue; // all other system events are bootstrap/periodic noise
		}

		if (type === "result") {
			const usageRaw = (o.usage ?? {}) as Record<string, unknown>;
			turns.push({
				kind: "result",
				dir: "info",
				role: "system",
				status: o.is_error ? "error" : String(o.subtype ?? "success"),
				durationMs: Number(o.duration_ms ?? 0),
				costUsd: Number(o.total_cost_usd ?? 0),
				numTurns: Number(o.num_turns ?? 0),
				usage: {
					inputTokens: Number(usageRaw.input_tokens ?? 0),
					outputTokens: Number(usageRaw.output_tokens ?? 0),
				},
			});
			continue;
		}

		const message = o.message as
			| { role?: string; content?: unknown }
			| undefined;
		if (!message) continue;
		const role = message.role;
		const content = message.content;

		// A plain-text user message is a typed prompt (the task / a continuation),
		// not a tool result.
		if (role === "user") {
			if (typeof content === "string") {
				if (content.trim())
					turns.push({ kind: "prompt", dir: "request", role: "user", text: content });
				continue;
			}
			if (!Array.isArray(content)) continue;
			for (const b of content as Block[]) {
				if (b.type === "tool_result") {
					turns.push({
						kind: "tool_result",
						dir: "response",
						role: "tool",
						forId: String(b.tool_use_id ?? ""),
						tool: toolNameById.get(String(b.tool_use_id ?? "")),
						output: resultText(b.content),
						isError: Boolean(b.is_error),
					});
				} else if (b.type === "text" && typeof b.text === "string") {
					if (b.text.trim())
						turns.push({ kind: "prompt", dir: "request", role: "user", text: b.text });
				}
			}
			continue;
		}

		if (role === "assistant" && Array.isArray(content)) {
			for (const b of content as Block[]) {
				if (b.type === "text" && typeof b.text === "string") {
					if (b.text.trim())
						turns.push({
							kind: "assistant",
							dir: "response",
							role: "assistant",
							text: b.text,
						});
				} else if (b.type === "thinking" && typeof b.thinking === "string") {
					if (b.thinking.trim())
						turns.push({
							kind: "thinking",
							dir: "info",
							role: "assistant",
							text: b.thinking,
						});
				} else if (b.type === "tool_use") {
					const id = String(b.id ?? "");
					const tool = String(b.name ?? "tool");
					if (id) toolNameById.set(id, tool);
					turns.push({
						kind: "tool_use",
						dir: "request",
						role: "assistant",
						id,
						tool,
						input: b.input ?? {},
					});
				}
			}
		}
	}
	return turns;
}

/** Fence a body as a code block, truncating past `max` with a size marker that
 *  names the elided bytes and the source file (the `.jsonl` stays unabridged). */
function fence(body: string, lang: string, source: string, max = MAX_INLINE): string {
	const bytes = Buffer.byteLength(body, "utf8");
	let shown = body;
	if (bytes > max) {
		shown = `${body.slice(0, max)}\n… [+${Math.round((bytes - max) / 1024)} KB elided — see ${source}]`;
	}
	const lines = ["```" + lang, shown.replace(/```/g, "ʼʼʼ"), "```"];
	return lines.join("\n");
}

/** Render parsed turns to a readable Markdown conversation. `source` names the
 *  backing `.jsonl` for truncation markers. */
export function renderMarkdown(turns: Turn[], source = "the session .jsonl"): string {
	const out: string[] = [];
	for (const t of turns) {
		switch (t.kind) {
			case "init":
				out.push(
					`> **session start** · model \`${t.model}\`` +
						(t.cwd ? ` · cwd \`${t.cwd}\`` : "") +
						` · ${t.tools.length} tools available`,
				);
				break;
			case "prompt":
				out.push(`#### ▶ PROMPT (user → agent)\n\n${blockquote(t.text)}`);
				break;
			case "thinking":
				out.push(`<details><summary>💭 thinking</summary>\n\n${blockquote(t.text)}\n\n</details>`);
				break;
			case "assistant":
				out.push(`#### 🟢 ASSISTANT (response)\n\n${t.text}`);
				break;
			case "tool_use":
				out.push(
					`#### → REQUEST · \`${t.tool}\`\n\n${fence(
						JSON.stringify(t.input, null, 2),
						"json",
						source,
					)}`,
				);
				break;
			case "tool_result":
				out.push(
					`#### ← RESPONSE · \`${t.tool ?? "tool"}\`${t.isError ? " · ✗ error" : ""}\n\n${fence(
						t.output,
						"",
						source,
					)}`,
				);
				break;
			case "result": {
				const u = t.usage;
				out.push(
					`---\n\n**result: ${t.status}** · ${t.numTurns} turns · ${(t.durationMs / 1000).toFixed(1)}s · $${t.costUsd.toFixed(4)}` +
						(u ? ` · ${u.inputTokens} in / ${u.outputTokens} out tokens` : ""),
				);
				break;
			}
		}
	}
	return out.join("\n\n") + "\n";
}

function blockquote(text: string): string {
	return text
		.split("\n")
		.map((l) => `> ${l}`)
		.join("\n");
}

export interface RenderedSession {
	/** `session-NNN.jsonl` basename. */
	name: string;
	turns: Turn[];
	md: string;
}

export interface RenderedTrial {
	/** Combined, session-headed Markdown for the whole build conversation. */
	conversationMd: string;
	sessions: RenderedSession[];
}

/** Locate a trial's archived session transcripts, sorted by step. */
export function sessionFiles(transcriptsDir: string): string[] {
	if (!existsSync(transcriptsDir)) return [];
	return readdirSync(transcriptsDir)
		.filter((f) => /^session-\d+\.jsonl$/.test(f))
		.sort()
		.map((f) => join(transcriptsDir, f));
}

/**
 * Render every session of a trial into per-session turns/Markdown plus one
 * combined `conversation.md` body, with each session under a labeled heading so
 * a multi-step build reads as a single ordered conversation. Pure read — never
 * writes or mutates the `.jsonl`.
 */
export function renderTrial(trialDir: string): RenderedTrial {
	const transcriptsDir = join(trialDir, "transcripts");
	const files = sessionFiles(transcriptsDir);
	const sessions: RenderedSession[] = files.map((path) => {
		const name = basename(path);
		const turns = parseTranscript(readFileSync(path, "utf8"));
		return { name, turns, md: renderMarkdown(turns, name) };
	});
	const header = `# Trial conversation — ${basename(trialDir)}\n\n_${sessions.length} session(s). Rendered from stream-json; \`session-NNN.jsonl\` is the unabridged ground truth._`;
	const body = sessions
		.map(
			(s, i) =>
				`## Session ${i} — ${s.name}\n\n${s.md.trim() || "_(empty session)_"}`,
		)
		.join("\n\n---\n\n");
	return {
		conversationMd: `${header}\n\n${body}\n`,
		sessions,
	};
}
