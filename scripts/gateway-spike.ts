// Task 4.3 spike (add-brownfield-track): Claude Code through a credential-injecting proxy.
//   bun scripts/gateway-spike.ts   (reads .env; ~$0.003 of Haiku calls; prints request shapes, never secrets)
// Logs request shape only (header NAMES, auth scheme, model, beta flags, tool types) — never secret values.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const envFile = readFileSync(join(import.meta.dir, "..", ".env"), "utf8");
const secret = (k: string) =>
	envFile.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const OAUTH = secret("CLAUDE_CODE_OAUTH_TOKEN");
const API_KEY = secret("ANTHROPIC_API_KEY");
const UPSTREAM = "https://api.anthropic.com";

type Mode = "api-key" | "oauth";
let mode: Mode = "oauth";
const log: Record<string, unknown>[] = [];

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	idleTimeout: 120,
	async fetch(req) {
		const url = new URL(req.url);
		const body = req.method === "POST" ? await req.text() : undefined;
		let parsed: Record<string, unknown> = {};
		try {
			parsed = body ? JSON.parse(body) : {};
		} catch {}
		const inAuth = req.headers.get("authorization");
		const tools =
			(parsed.tools as { type?: string; name?: string }[] | undefined) ?? [];
		log.push({
			mode,
			method: req.method,
			path: url.pathname,
			model: parsed.model,
			clientAuth: inAuth
				? `bearer:${inAuth.includes("placeholder") ? "placeholder" : "REAL?!"}`
				: req.headers.get("x-api-key")
					? `x-api-key:${req.headers.get("x-api-key")?.includes("placeholder") ? "placeholder" : "REAL?!"}`
					: "none",
			beta: req.headers.get("anthropic-beta"),
			headerNames: [...req.headers.keys()]
				.filter((h) => !["authorization", "x-api-key"].includes(h))
				.sort(),
			toolCount: tools.length,
			toolNames: tools.map((t) =>
				t.type && !("input_schema" in t) ? `${t.type}:${t.name}` : t.name,
			),
			serverTools: tools
				.filter((t) => t.type && t.type !== "custom" && !("input_schema" in t))
				.map((t) => `${t.type}:${t.name}`),
		});
		const headers = new Headers(req.headers);
		headers.delete("host");
		headers.delete("authorization");
		headers.delete("x-api-key");
		headers.delete("content-length");
		if (mode === "api-key") headers.set("x-api-key", API_KEY);
		else headers.set("authorization", `Bearer ${OAUTH}`);
		const up = await fetch(UPSTREAM + url.pathname + url.search, {
			method: req.method,
			headers,
			body,
		});
		const entry = log.at(-1) as Record<string, unknown>;
		entry.status = up.status;
		if (up.status >= 400) entry.error = (await up.clone().text()).slice(0, 300);
		// fetch() already decompressed the body; don't forward the encoding headers.
		const out = new Headers(up.headers);
		out.delete("content-encoding");
		out.delete("content-length");
		return new Response(up.body, { status: up.status, headers: out });
	},
});
const base = `http://127.0.0.1:${server.port}`;

async function runClaude(m: Mode, toolsOn: boolean) {
	mode = m;
	const cfg = mkdtempSync(join(tmpdir(), "cc-cfg-"));
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: cfg, // fresh home: no operator settings, MCP, memory
		CLAUDE_CONFIG_DIR: cfg,
		ANTHROPIC_BASE_URL: base,
		ANTHROPIC_API_KEY: m === "api-key" ? "sk-ant-api03-placeholder" : "",
	};
	if (m === "oauth") env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-placeholder";
	const args = [
		"claude",
		"-p",
		"--model",
		"claude-haiku-5-5",
		"--output-format",
		"json",
		"--strict-mcp-config",
		"--setting-sources",
		"",
	];
	if (!toolsOn) args.push("--tools", "");
	const p = Bun.spawn(args, {
		cwd: cfg,
		env,
		stdin: new TextEncoder().encode("Reply with exactly: OK"),
		stdout: "pipe",
		stderr: "pipe",
	});
	const out = await new Response(p.stdout).text();
	const err = await new Response(p.stderr).text();
	const code = await p.exited;
	rmSync(cfg, { recursive: true, force: true });
	let res: Record<string, unknown> = {};
	try {
		res = JSON.parse(out);
	} catch {}
	return {
		mode: m,
		toolsOn,
		exit: code,
		result: res.result ?? null,
		is_error: res.is_error ?? null,
		cost: res.total_cost_usd ?? null,
		stderr: err.slice(0, 300),
	};
}

const results = [
	await runClaude("api-key", false),
	await runClaude("oauth", false),
	await runClaude("oauth", true),
];
server.stop(true);
console.log(JSON.stringify({ results, requests: log }, null, 2));
