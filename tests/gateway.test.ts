import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	blockedTools,
	requestedModel,
	startGateway,
} from "../src/gateway/server";

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function fakeUpstream() {
	const seen: { path: string; key: string; auth: string; body: string }[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(req) {
			seen.push({
				path: new URL(req.url).pathname,
				key: req.headers.get("x-api-key") ?? "",
				auth: req.headers.get("authorization") ?? "",
				body: req.method === "GET" ? "" : await req.text(),
			});
			return Response.json({ ok: true });
		},
	});
	return { url: `http://127.0.0.1:${server.port}`, server, seen };
}

function gatewayFor(upstream: string, model = "claude-haiku-4-5-20251001") {
	const dir = mkdtempSync(join(tmpdir(), "gw-"));
	dirs.push(dir);
	const gw = startGateway({
		upstream,
		apiKey: "sk-real",
		model,
		logPath: join(dir, "requests.jsonl"),
	});
	return { gw, logPath: join(dir, "requests.jsonl") };
}

test("helpers detect the model and blocked server tools", () => {
	expect(requestedModel({ model: "m" })).toBe("m");
	expect(requestedModel({})).toBeNull();
	expect(
		blockedTools({
			tools: [{ type: "web_search_20250305" }, { type: "custom" }],
		}),
	).toEqual(["web_search_20250305"]);
	expect(
		blockedTools({ tools: [{ type: "web_fetch_20250910" }] }),
	).toHaveLength(1);
	expect(blockedTools({})).toEqual([]);
});

test("forwards the run model with the injected credential", async () => {
	const up = await fakeUpstream();
	const { gw, logPath } = gatewayFor(up.url);
	try {
		const res = await fetch(`${gw.url}/v1/messages`, {
			method: "POST",
			headers: {
				"x-api-key": "gateway-placeholder",
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-haiku-4-5-20251001",
				messages: [],
			}),
		});
		expect(res.status).toBe(200);
		expect(up.seen[0]?.key).toBe("sk-real");
		expect(up.seen[0]?.auth).toBe("Bearer sk-real");
		expect(JSON.parse(up.seen[0]!.body).messages).toEqual([]);
		const logged = readFileSync(logPath, "utf8")
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(logged[0].status).toBe(200);
		expect(logged[0].model).toBe("claude-haiku-4-5-20251001");
	} finally {
		gw.stop();
		up.server.stop(true);
	}
});

test("rejects a different model and provider-side tools without forwarding", async () => {
	const up = await fakeUpstream();
	const { gw } = gatewayFor(up.url);
	try {
		const wrongModel = await fetch(`${gw.url}/v1/messages`, {
			method: "POST",
			body: JSON.stringify({ model: "claude-opus-4-6", messages: [] }),
		});
		expect(wrongModel.status).toBe(403);
		const tool = await fetch(`${gw.url}/v1/messages`, {
			method: "POST",
			body: JSON.stringify({
				model: "claude-haiku-4-5-20251001",
				tools: [{ type: "web_search_20250305", name: "web_search" }],
				messages: [],
			}),
		});
		expect(tool.status).toBe(403);
		expect(up.seen).toHaveLength(0);
	} finally {
		gw.stop();
		up.server.stop(true);
	}
});

test("only /v1 paths are proxied", async () => {
	const up = await fakeUpstream();
	const { gw } = gatewayFor(up.url);
	try {
		const res = await fetch(`${gw.url}/admin/keys`);
		expect(res.status).toBe(404);
		const models = await fetch(`${gw.url}/v1/models`);
		expect(models.status).toBe(200);
	} finally {
		gw.stop();
		up.server.stop(true);
	}
});
