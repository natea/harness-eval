/**
 * Model gateway (task 4.4): the sandbox never holds the real credential. Claude
 * Code points at this proxy with a placeholder key; the gateway injects the
 * operator's key, forwards only the run's model, and rejects provider-side tool
 * requests (web search/fetch) that would reach the upstream fix.
 */
import { appendFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { type GatewayCredential, injectCredential } from "./credential";

/** Provider-side tools a worker must not use (server executes them upstream). */
const BLOCKED_TOOL_RE = /^web_(search|fetch)|^code_execution|^computer_/;

export interface GatewayLogEntry {
	at: string;
	method: string;
	path: string;
	model: string | null;
	status: number;
	blocked?: "model" | "tool" | "path";
}

export interface GatewayOptions {
	/** Upstream base, e.g. https://api.anthropic.com */
	upstream: string;
	/** Real credential to inject (default: subscription OAuth, see credential.ts). */
	credential?: GatewayCredential;
	/** Legacy API-key form. */
	apiKey?: string;
	/** The only model this run may use. */
	model: string;
	logPath: string;
	port?: number;
}

export interface Gateway {
	url: string;
	port: number;
	requests: GatewayLogEntry[];
	stop(): void;
}

/** Tools the request asked for that the gateway refuses to forward. */
export function blockedTools(body: unknown): string[] {
	const tools = (body as { tools?: unknown })?.tools;
	if (!Array.isArray(tools)) return [];
	return tools
		.map((t) => (t as { type?: string })?.type ?? "")
		.filter((t) => BLOCKED_TOOL_RE.test(t));
}

/** Model requested by a body, if any. */
export function requestedModel(body: unknown): string | null {
	const m = (body as { model?: unknown })?.model;
	return typeof m === "string" ? m : null;
}

export function startGateway(opts: GatewayOptions): Gateway {
	mkdirSync(dirname(opts.logPath), { recursive: true });
	const requests: GatewayLogEntry[] = [];
	const log = (e: GatewayLogEntry) => {
		requests.push(e);
		appendFileSync(opts.logPath, `${JSON.stringify(e)}\n`);
	};

	const handler = {
		// Model responses can sit idle >10s (Bun's default) before the first
		// token; a cut here looks like a provider error to the worker.
		idleTimeout: 255,
		async fetch(req: Request) {
			const url = new URL(req.url);
			const entry: GatewayLogEntry = {
				at: new Date().toISOString(),
				method: req.method,
				path: url.pathname,
				model: null,
				status: 0,
			};
			if (!url.pathname.startsWith("/v1/")) {
				entry.status = 404;
				entry.blocked = "path";
				log(entry);
				return Response.json(
					{ error: "gateway: path not allowed" },
					{ status: 404 },
				);
			}
			let body: unknown;
			if (req.method !== "GET") {
				const text = await req.text();
				try {
					body = text ? JSON.parse(text) : undefined;
				} catch {
					entry.status = 400;
					log(entry);
					return Response.json(
						{ error: "gateway: invalid JSON" },
						{ status: 400 },
					);
				}
			}
			entry.model = requestedModel(body);
			if (entry.model && entry.model !== opts.model) {
				entry.status = 403;
				entry.blocked = "model";
				log(entry);
				return Response.json(
					{ error: `gateway: model '${entry.model}' is not the run model` },
					{ status: 403 },
				);
			}
			const banned = blockedTools(body);
			if (banned.length) {
				entry.status = 403;
				entry.blocked = "tool";
				log(entry);
				return Response.json(
					{
						error: `gateway: provider-side tools are disabled (${banned.join(", ")})`,
					},
					{ status: 403 },
				);
			}

			const headers = new Headers();
			for (const [k, v] of req.headers) {
				if (
					["host", "authorization", "x-api-key", "content-length"].includes(
						k.toLowerCase(),
					)
				)
					continue;
				headers.set(k, v);
			}
			if (opts.credential) injectCredential(headers, opts.credential);
			else {
				// Legacy form: some Anthropic-compatible endpoints (e.g. z.ai, used by
				// `model probe --gateway`) read the Bearer header, so send both.
				headers.set("x-api-key", opts.apiKey ?? "");
				headers.set("authorization", `Bearer ${opts.apiKey ?? ""}`);
			}
			const upstream = await fetch(
				`${opts.upstream}${url.pathname}${url.search}`,
				{
					method: req.method,
					headers,
					body: req.method === "GET" ? undefined : JSON.stringify(body),
				},
			);
			entry.status = upstream.status;
			log(entry);
			// Bun's fetch already decompressed the body; forwarding
			// `content-encoding` makes the client decompress it again
			// (BrotliDecompressionError in Claude Code).
			const outHeaders = new Headers(upstream.headers);
			for (const h of [
				"content-encoding",
				"content-length",
				"transfer-encoding",
			])
				outHeaders.delete(h);
			return new Response(upstream.body, {
				status: upstream.status,
				headers: outHeaders,
			});
		},
	};
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: opts.port ?? 0,
		...handler,
	} as Parameters<typeof Bun.serve>[0]);

	// Never keep the run process alive on the gateway's account.
	server.unref();
	const port = server.port ?? 0;
	return {
		url: `http://127.0.0.1:${port}`,
		port,
		requests,
		stop: () => server.stop(true),
	};
}

export interface UnixRelay {
	socketPath: string;
	stop(): void;
}

/**
 * Bridges the gateway's TCP port onto a unix socket so a loopback-only network
 * namespace (task 4.4 egress lockdown) can reach it without any route out.
 * `socat` is used because Bun 1.4's unix listener accepts connections but never
 * answers.
 */
export function startUnixRelay(socketPath: string, tcpPort: number): UnixRelay {
	try {
		unlinkSync(socketPath);
	} catch {}
	const proc = Bun.spawn(
		[
			"socat",
			`UNIX-LISTEN:${socketPath},fork,reuseaddr`,
			`TCP:127.0.0.1:${tcpPort}`,
		],
		{ stdin: "ignore", stdout: "ignore", stderr: "ignore" },
	);
	proc.unref();
	return { socketPath, stop: () => proc.kill() };
}
