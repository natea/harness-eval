import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	claudeCodeGatewayEnv,
	type Gateway,
	newPlaceholder,
	serverSideFeatures,
	startGateway,
} from "../src/gateway/anthropic";

const MODEL = "claude-test-1";
const REAL_KEY = "sk-ant-api03-REAL-never-in-sandbox";

let dir: string;
let upstream: ReturnType<typeof Bun.serve>;
let seen: {
	path: string;
	key: string | null;
	auth: string | null;
	body: string;
}[];
let gw: Gateway;
let placeholder: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "gw-"));
	seen = [];
	upstream = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			seen.push({
				path: url.pathname,
				key: req.headers.get("x-api-key"),
				auth: req.headers.get("authorization"),
				body: req.method === "POST" ? await req.text() : "",
			});
			return Response.json(
				{ ok: true },
				{ headers: { "request-id": "req_1" } },
			);
		},
	});
	placeholder = newPlaceholder();
	gw = startGateway({
		model: MODEL,
		apiKey: REAL_KEY,
		placeholder,
		logPath: join(dir, "gateway.jsonl"),
		upstream: `http://127.0.0.1:${upstream.port}`,
	});
});
afterAll(() => {
	gw.stop();
	upstream.stop(true);
	rmSync(dir, { recursive: true, force: true });
});

const post = (body: unknown, key = placeholder, path = "/v1/messages") =>
	fetch(gw.url + path, {
		method: "POST",
		headers: { "x-api-key": key, "content-type": "application/json" },
		body: JSON.stringify(body),
	});

const logLines = () =>
	readFileSync(join(dir, "gateway.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((l) => JSON.parse(l));

describe("model gateway (task 4.4)", () => {
	test("forwards the run's model with the real key swapped in", async () => {
		const r = await post({
			model: MODEL,
			messages: [],
			tools: [{ name: "Bash", input_schema: {} }],
		});
		expect(r.status).toBe(200);
		const last = seen.at(-1);
		expect(last?.key).toBe(REAL_KEY);
		expect(last?.auth).toBeNull();
		expect(logLines().at(-1)).toMatchObject({
			verdict: "forwarded",
			model: MODEL,
			status: 200,
			requestId: "req_1",
		});
	});

	test("count_tokens is forwarded under the same checks", async () => {
		expect(
			(
				await post(
					{ model: MODEL, messages: [] },
					placeholder,
					"/v1/messages/count_tokens",
				)
			).status,
		).toBe(200);
	});

	test("rejects another model, logs it, never reaches upstream", async () => {
		const before = seen.length;
		const r = await post({ model: "claude-other", messages: [] });
		expect(r.status).toBe(403);
		expect((await r.json()).error.message).toContain("model not allowed");
		expect(seen.length).toBe(before);
		expect(logLines().at(-1)).toMatchObject({
			verdict: "rejected",
			model: "claude-other",
		});
	});

	test("rejects provider-side tools rather than stripping them", async () => {
		const before = seen.length;
		const r = await post({
			model: MODEL,
			messages: [],
			tools: [
				{ name: "Bash", input_schema: {} },
				{ type: "web_search_20250305", name: "web_search" },
			],
		});
		expect(r.status).toBe(403);
		expect(seen.length).toBe(before);
		expect(
			gw
				.rejections()
				.some((e) => e.serverTools?.includes("web_search_20250305:web_search")),
		).toBe(true);
	});

	test("refuses a request without the run's placeholder (e.g. a real key)", async () => {
		expect((await post({ model: MODEL, messages: [] }, REAL_KEY)).status).toBe(
			401,
		);
		expect(
			(await post({ model: MODEL, messages: [] }, `${placeholder}x`)).status,
		).toBe(401);
	});

	test("refuses paths outside the Messages API; passes the health check", async () => {
		expect((await post({}, placeholder, "/v1/files")).status).toBe(403);
		expect((await fetch(`${gw.url}/api/hello`)).status).toBe(200);
	});
});

describe("server-side feature detection", () => {
	test("client-executed Anthropic tools pass; provider-executed ones and fields are caught", () => {
		expect(
			serverSideFeatures({
				tools: [
					{ name: "Read", input_schema: {} },
					{ type: "custom", name: "x", input_schema: {} },
					{ type: "bash_20250124", name: "bash" },
					{ type: "text_editor_20250728", name: "str_replace_based_edit_tool" },
				],
			}),
		).toEqual([]);
		expect(
			serverSideFeatures({
				tools: [
					{ type: "web_fetch_20250910", name: "web_fetch" },
					{ type: "code_execution_20250825", name: "code_execution" },
					{ type: "tool_search_tool_regex_20251119", name: "tool_search" },
				],
				mcp_servers: [{ url: "https://x" }],
			}),
		).toEqual([
			"web_fetch_20250910:web_fetch",
			"code_execution_20250825:code_execution",
			"tool_search_tool_regex_20251119:tool_search",
			"field:mcp_servers",
		]);
	});
});

describe("Claude Code env behind the gateway", () => {
	test("placeholder only, every slot pinned to the run's model", () => {
		const { env, modelFlag } = claudeCodeGatewayEnv(
			MODEL,
			"http://gw:1",
			placeholder,
		);
		expect(env.ANTHROPIC_API_KEY?.startsWith("sk-ant-api03-")).toBe(true);
		expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("");
		for (const k of ["OPUS", "SONNET", "HAIKU"])
			expect(env[`ANTHROPIC_DEFAULT_${k}_MODEL`]).toBe(MODEL);
		expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe(MODEL);
		expect(modelFlag).toBe(MODEL);
	});
});
