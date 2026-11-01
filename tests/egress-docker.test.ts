// Docker integration test (no model spend). Opt-in: HE_DOCKER_TESTS=1 bun run test
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Gateway,
	newPlaceholder,
	startGateway,
} from "../src/gateway/anthropic";
import {
	createDockerProvider,
	DEFAULT_TRIAL_IMAGE,
} from "../src/providers/docker";
import { DockerEgressLock, EGRESS_LEAK_PROBES } from "../src/providers/egress";
import type { Sandbox } from "../src/providers/types";

const enabled = process.env.HE_DOCKER_TESTS === "1";
const t = enabled ? test : test.skip;

let dir: string;
let upstream: ReturnType<typeof Bun.serve>;
let gw: Gateway;
let lock: DockerEgressLock;
let sb: Sandbox;
const placeholder = newPlaceholder();

beforeAll(async () => {
	if (!enabled) return;
	dir = mkdtempSync(join(tmpdir(), "egress-"));
	upstream = Bun.serve({
		port: 0,
		fetch: () => Response.json({ upstream: "fake" }),
	});
	gw = startGateway({
		model: "m1",
		apiKey: "sk-ant-api03-fake",
		placeholder,
		logPath: join(dir, "gw.jsonl"),
		upstream: `http://127.0.0.1:${upstream.port}`,
	});
	lock = new DockerEgressLock({
		runId: `test-${Date.now().toString(36)}`,
		image: DEFAULT_TRIAL_IMAGE,
		gatewayPort: gw.port,
	});
	sb = await createDockerProvider().provision(
		`egress-test-${Date.now().toString(36)}`,
	);
	await lock.start();
	await lock.attach(sb.id.split(":")[1] ?? "");
	await Bun.sleep(1500); // relay startup
}, 180_000);

afterAll(async () => {
	if (!enabled) return;
	await sb?.destroy();
	await lock?.stop();
	gw?.stop();
	upstream?.stop(true);
	rmSync(dir, { recursive: true, force: true });
}, 120_000);

const call = (model: string) =>
	`curl -sS -m 10 ${lock.baseUrl}/v1/messages -H 'x-api-key: ${placeholder}' -H 'content-type: application/json' -d '{"model":"${model}","messages":[]}'`;

t(
	"a locked trial can't reach the internet, DNS, or the host directly",
	async () => {
		for (const p of EGRESS_LEAK_PROBES)
			expect((await sb.exec(p)).exitCode).not.toBe(0);
	},
	60_000,
);

t(
	"the gateway is reachable through the relay and still enforces policy",
	async () => {
		expect((await sb.exec(call("m1"))).stdout).toContain("fake");
		expect((await sb.exec(call("other"))).stdout).toContain(
			"model not allowed",
		);
	},
	60_000,
);
