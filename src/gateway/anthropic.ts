/**
 * Run-owned model gateway, Anthropic protocol (add-brownfield-track D11, task 4.4).
 *
 * Runs outside the sandbox. The sandbox holds only a per-run placeholder key; the
 * gateway checks it, swaps in the real API key, forwards only to the run's model,
 * rejects (never strips) requests that enable provider-side tools, and logs every
 * request as JSONL. No protocol translation.
 */

import { appendFileSync } from "node:fs";

export const UPSTREAM_ANTHROPIC = "https://api.anthropic.com";
/** Claude Code picks its auth scheme from the key prefix, so the placeholder keeps it. */
export const PLACEHOLDER_PREFIX = "sk-ant-api03-hegw-";

/**
 * Anthropic-defined tool types that execute in the client (the sandbox), so the
 * sandbox firewall governs them. Every other typed tool (web_search_*,
 * web_fetch_*, code_execution_*, tool_search_tool_*, …) runs on the provider and
 * is rejected.
 */
const CLIENT_TOOL_TYPE =
	/^(custom|bash_\d+|text_editor_\d+|computer_\d+|memory_\d+)$/;

/** Request fields that make the provider act on the model's behalf. */
const SERVER_SIDE_FIELDS = ["mcp_servers", "container"] as const;

export interface GatewayOptions {
	/** The one model this run may call. */
	model: string;
	/** Real credential; never leaves the gateway. */
	apiKey: string;
	/** Placeholder the sandbox presents; requests without it are refused. */
	placeholder: string;
	/** JSONL request log. */
	logPath: string;
	upstream?: string;
	hostname?: string;
	port?: number;
}

export interface GatewayLogEntry {
	at: string;
	method: string;
	path: string;
	model?: string;
	verdict: "forwarded" | "rejected";
	reason?: string;
	serverTools?: string[];
	toolCount?: number;
	status?: number;
	requestId?: string | null;
}

interface ToolDecl {
	type?: string;
	name?: string;
	input_schema?: unknown;
}

/** Provider-side tools and fields a Messages request enables, as `type:name` strings. */
export function serverSideFeatures(body: Record<string, unknown>): string[] {
	const found: string[] = [];
	const tools = Array.isArray(body.tools) ? (body.tools as ToolDecl[]) : [];
	for (const t of tools) {
		// A plain custom tool has an input_schema and no type (or type "custom").
		if (t.type === undefined) continue;
		if (!CLIENT_TOOL_TYPE.test(t.type))
			found.push(`${t.type}:${t.name ?? "?"}`);
	}
	for (const f of SERVER_SIDE_FIELDS)
		if (body[f] != null) found.push(`field:${f}`);
	return found;
}

/** The request paths the gateway serves; anything else is refused. */
const MODEL_PATHS = new Set(["/v1/messages", "/v1/messages/count_tokens"]);
const PASSTHROUGH_PATHS = new Set(["/api/hello"]);

export type Decision =
	| { ok: true; model?: string; serverTools: string[]; toolCount: number }
	| {
			ok: false;
			status: number;
			reason: string;
			model?: string;
			serverTools?: string[];
			toolCount?: number;
	  };

/** Pure policy check for one request. */
export function decide(
	opts: Pick<GatewayOptions, "model" | "placeholder">,
	method: string,
	path: string,
	headers: Headers,
	body: Record<string, unknown> | null,
): Decision {
	if (PASSTHROUGH_PATHS.has(path) && method === "GET")
		return { ok: true, serverTools: [], toolCount: 0 };
	const presented =
		headers.get("x-api-key") ??
		headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
		null;
	if (presented !== opts.placeholder)
		return {
			ok: false,
			status: 401,
			reason: "missing or unknown placeholder credential",
		};
	if (!MODEL_PATHS.has(path) || method !== "POST")
		return {
			ok: false,
			status: 403,
			reason: `path not allowed: ${method} ${path}`,
		};
	if (!body) return { ok: false, status: 400, reason: "body is not JSON" };
	const model = typeof body.model === "string" ? body.model : undefined;
	const toolCount = Array.isArray(body.tools) ? body.tools.length : 0;
	if (model !== opts.model)
		return {
			ok: false,
			status: 403,
			reason: `model not allowed: ${model ?? "(none)"} (run model is ${opts.model})`,
			model,
			toolCount,
		};
	const serverTools = serverSideFeatures(body);
	if (serverTools.length)
		return {
			ok: false,
			status: 403,
			reason: `provider-side tools not allowed: ${serverTools.join(", ")}`,
			model,
			serverTools,
			toolCount,
		};
	return { ok: true, model, serverTools, toolCount };
}

const anthropicError = (status: number, message: string) =>
	Response.json(
		{
			type: "error",
			error: {
				type:
					status === 401
						? "authentication_error"
						: status === 400
							? "invalid_request_error"
							: "permission_error",
				message: `harness-eval gateway: ${message}`,
			},
		},
		{ status },
	);

export interface Gateway {
	url: string;
	port: number;
	/** Rejections so far (any one flags the trial for review). */
	rejections(): GatewayLogEntry[];
	stop(): void;
}

export function startGateway(opts: GatewayOptions): Gateway {
	if (!opts.placeholder.startsWith(PLACEHOLDER_PREFIX))
		throw new Error(
			`gateway placeholder must start with ${PLACEHOLDER_PREFIX}`,
		);
	if (!opts.apiKey) throw new Error("gateway needs a real API key");
	const upstream = opts.upstream ?? UPSTREAM_ANTHROPIC;
	const rejected: GatewayLogEntry[] = [];
	const log = (e: GatewayLogEntry) => {
		appendFileSync(opts.logPath, `${JSON.stringify(e)}\n`);
		if (e.verdict === "rejected") rejected.push(e);
	};

	const server = Bun.serve({
		hostname: opts.hostname ?? "127.0.0.1",
		port: opts.port ?? 0,
		idleTimeout: 255, // long streamed responses
		async fetch(req) {
			const url = new URL(req.url);
			const raw = req.method === "POST" ? await req.text() : undefined;
			let body: Record<string, unknown> | null = null;
			if (raw !== undefined) {
				try {
					const parsed = JSON.parse(raw);
					body = parsed && typeof parsed === "object" ? parsed : null;
				} catch {
					body = null;
				}
			}
			const d = decide(opts, req.method, url.pathname, req.headers, body);
			const base = {
				at: new Date().toISOString(),
				method: req.method,
				path: url.pathname,
			};
			if (!d.ok) {
				log({
					...base,
					verdict: "rejected",
					reason: d.reason,
					model: d.model,
					serverTools: d.serverTools,
					toolCount: d.toolCount,
					status: d.status,
				});
				return anthropicError(d.status, d.reason);
			}
			const headers = new Headers(req.headers);
			for (const h of ["host", "authorization", "x-api-key", "content-length"])
				headers.delete(h);
			headers.set("x-api-key", opts.apiKey);
			let up: Response;
			try {
				up = await fetch(upstream + url.pathname + url.search, {
					method: req.method,
					headers,
					body: raw,
				});
			} catch (e) {
				log({
					...base,
					verdict: "forwarded",
					model: d.model,
					toolCount: d.toolCount,
					status: 502,
					reason: `upstream unreachable: ${(e as Error).message}`,
				});
				return anthropicError(502, "upstream unreachable");
			}
			log({
				...base,
				verdict: "forwarded",
				model: d.model,
				toolCount: d.toolCount,
				status: up.status,
				requestId: up.headers.get("request-id"),
			});
			// fetch() already decompressed the body; don't forward the encoding headers.
			const out = new Headers(up.headers);
			out.delete("content-encoding");
			out.delete("content-length");
			return new Response(up.body, { status: up.status, headers: out });
		},
	});
	const host =
		opts.hostname && opts.hostname !== "0.0.0.0" ? opts.hostname : "127.0.0.1";
	return {
		url: `http://${host}:${server.port}`,
		port: server.port as number,
		rejections: () => [...rejected],
		stop: () => server.stop(true),
	};
}

/** A fresh per-run placeholder key. */
export function newPlaceholder(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return PLACEHOLDER_PREFIX + Buffer.from(bytes).toString("base64url");
}

/**
 * Claude Code env for a trial behind the gateway: placeholder key only, every
 * model slot pinned to the run's model (background haiku requests included),
 * nonessential traffic off. `baseUrl` is the gateway as seen from the sandbox.
 */
export function claudeCodeGatewayEnv(
	model: string,
	baseUrl: string,
	placeholder: string,
): { env: Record<string, string>; modelFlag: string } {
	return {
		env: {
			ANTHROPIC_BASE_URL: baseUrl,
			ANTHROPIC_API_KEY: placeholder,
			ANTHROPIC_AUTH_TOKEN: "",
			CLAUDE_CODE_OAUTH_TOKEN: "",
			ANTHROPIC_MODEL: model,
			ANTHROPIC_SMALL_FAST_MODEL: model,
			ANTHROPIC_DEFAULT_OPUS_MODEL: model,
			ANTHROPIC_DEFAULT_SONNET_MODEL: model,
			ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
			CLAUDE_CODE_SUBAGENT_MODEL: model,
			CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		},
		modelFlag: model,
	};
}
