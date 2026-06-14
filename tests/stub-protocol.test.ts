import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runStub(lines: string[], mode = "normal"): Promise<string[]> {
	const dir = mkdtempSync(join(tmpdir(), "he-stub-"));
	const proc = Bun.spawn(
		["bun", "targets/symphony-daemon/fixtures/stub-app-server.ts"],
		{
			stdin: new TextEncoder().encode(`${lines.join("\n")}\n`),
			stdout: "pipe",
			env: {
				...process.env,
				STUB_MODE: mode,
				STUB_LOG_FILE: join(dir, "stub.log"),
			},
		},
	);
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	rmSync(dir, { recursive: true, force: true });
	return out
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((l) => l);
}

describe("stub app-server protocol fidelity (testplan v1.1.0)", () => {
	test("documented happy path: initialize → thread/start → turn/start", async () => {
		const out = await runStub([
			'{"id":0,"method":"initialize","params":{"clientInfo":{"name":"t"}}}',
			'{"method":"initialized","params":{}}',
			'{"id":10,"method":"thread/start","params":{"cwd":"/ws"}}',
			'{"id":30,"method":"turn/start","params":{"input":[{"type":"text","text":"x"}]}}',
		]);
		const msgs = out.map((l) => JSON.parse(l));
		expect(msgs.find((m) => m.id === 0)?.result?.userAgent?.name).toBe(
			"stub-app-server",
		);
		expect(msgs.find((m) => m.id === 10)?.result?.thread?.id).toMatch(
			/^thr_stub_/,
		);
		// Exactly one response per request id (JSON-RPC)
		expect(msgs.filter((m) => m.id === 30)).toHaveLength(1);
		expect(msgs.find((m) => m.id === 30)?.result?.turn?.status).toBe(
			"inProgress",
		);
		const notifs = msgs.filter((m) => m.method).map((m) => m.method);
		expect(notifs).toContain("thread/started");
		expect(notifs).toContain("turn/started");
		expect(notifs).toContain("item/completed");
		expect(notifs).toContain("thread/tokenUsage/updated");
		expect(notifs).toContain("turn/completed");
	});

	test("pre-handshake request errors with Not initialized", async () => {
		const out = await runStub(['{"id":5,"method":"thread/start","params":{}}']);
		expect(JSON.parse(out[0] ?? "{}").error?.message).toBe("Not initialized");
	});

	test("unknown id-bearing methods are ACKed (liberality), not starved", async () => {
		const out = await runStub([
			'{"id":0,"method":"initialize","params":{}}',
			'{"method":"initialized"}',
			'{"id":7,"method":"client/init","params":{}}',
		]);
		const ack = out.map((l) => JSON.parse(l)).find((m) => m.id === 7);
		expect(ack?.result?.ok).toBe(true);
	});

	test("crash mode exits 3 mid-turn", async () => {
		const proc = Bun.spawn(
			["bun", "targets/symphony-daemon/fixtures/stub-app-server.ts"],
			{
				stdin: new TextEncoder().encode(
					'{"id":0,"method":"initialize","params":{}}\n{"method":"initialized"}\n{"id":1,"method":"turn/start","params":{"input":[]}}\n',
				),
				stdout: "pipe",
				env: { ...process.env, STUB_MODE: "crash", STUB_LOG_FILE: "/dev/null" },
			},
		);
		expect(await proc.exited).toBe(3);
	});
});
