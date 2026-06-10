import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createDockerProvider } from "../src/providers/docker";
import { createProvider } from "../src/providers/factory";
import {
	createMacosVzProvider,
	MIN_CONTAINER_CLI,
} from "../src/providers/macos-vz";
import { PreflightError } from "../src/providers/types";

function dockerAvailable(): boolean {
	try {
		execFileSync("docker", ["info"], { stdio: "ignore", timeout: 10_000 });
		return true;
	} catch {
		return false;
	}
}
const hasDocker = dockerAvailable();
const IMAGE = "harness-eval-trial:2.1.170-1";

describe("provider factory", () => {
	test("creates every provider id", () => {
		expect(createProvider("worktree").id).toBe("worktree");
		expect(createProvider("docker").id).toBe("docker");
		expect(createProvider("macos-vz").id).toBe("macos-vz");
		// daytona/e2b require env keys; constructor-level checks
		if (process.env.DAYTONA_API_KEY)
			expect(createProvider("daytona").id).toBe("daytona");
		if (process.env.E2B_API_KEY) expect(createProvider("e2b").id).toBe("e2b");
	});

	test("unknown id throws", () => {
		// biome-ignore lint/suspicious/noExplicitAny: deliberate invalid input
		expect(() => createProvider("podman" as any)).toThrow(/unknown provider/);
	});
});

describe("docker provider preflight", () => {
	test.if(hasDocker)(
		"missing image yields build-command guidance",
		async () => {
			const p = createDockerProvider("harness-eval-trial:does-not-exist");
			await expect(
				p.preflight({ trialWallClockMs: 1000, concurrency: 1 }),
			).rejects.toThrow(/build it with/);
		},
	);

	test.if(hasDocker)("present image passes preflight", async () => {
		const p = createDockerProvider(IMAGE);
		await p.preflight({ trialWallClockMs: 1000, concurrency: 1 });
	});
});

describe("macos-vz preflight", () => {
	test("fails clearly when container CLI absent or platform wrong", async () => {
		const p = createMacosVzProvider(IMAGE);
		// On this dev host (Apple Silicon, no `container` CLI) this must fail
		// with remediation, never hang or pass silently.
		await expect(
			p.preflight({ trialWallClockMs: 1000, concurrency: 1 }),
		).rejects.toThrow(PreflightError);
		expect(MIN_CONTAINER_CLI).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

describe.if(hasDocker)("docker provider end-to-end (live)", () => {
	test("provision/exec/write/copyOut/destroy and cross-trial contamination", async () => {
		const provider = createDockerProvider(IMAGE);
		const [a, b] = await Promise.all([
			provider.provision("dk-test-a"),
			provider.provision("dk-test-b"),
		]);
		try {
			// env propagation through bash -lc
			const env = await a.exec("echo $HE_PROBE", { env: { HE_PROBE: "v1" } });
			expect(env.stdout.trim()).toBe("v1");

			// toolchain present in image
			const tools = await a.exec(
				"node --version && bun --version && claude --version",
			);
			expect(tools.exitCode).toBe(0);
			expect(tools.stdout).toContain("2.1.170");

			// write + readback + copyOut
			await a.writeFile("hello.txt", "from-a");
			const read = await a.exec("cat hello.txt");
			expect(read.stdout.trim()).toBe("from-a");

			// contamination: b cannot see a's files or plugins
			await a.exec(
				"mkdir -p ~/.claude/plugins && echo x > ~/.claude/plugins/p.json",
			);
			const cross = await b.exec(
				"test -f hello.txt || test -f ~/.claude/plugins/p.json; echo $?",
			);
			expect(cross.stdout.trim()).toBe("1");

			const dest = `/tmp/he-dk-test-${Date.now()}`;
			await a.copyOut(a.workspacePath, dest);
			expect(
				execFileSync("cat", [`${dest}/hello.txt`])
					.toString()
					.trim(),
			).toBe("from-a");
			execFileSync("rm", ["-rf", dest]);
		} finally {
			await Promise.all([a.destroy(), b.destroy()]);
		}
	}, 120_000);

	test("stale container with same trial name is replaced", async () => {
		const provider = createDockerProvider(IMAGE);
		const first = await provider.provision("dk-stale");
		await first.writeFile("stale.txt", "old");
		// Crash simulation: do NOT destroy; provision same id again.
		const second = await provider.provision("dk-stale");
		try {
			const seen = await second.exec("test -f stale.txt; echo $?");
			expect(seen.stdout.trim()).toBe("1");
		} finally {
			await second.destroy();
		}
	}, 120_000);
});
