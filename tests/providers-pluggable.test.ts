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

function containerCliAvailable(): boolean {
	try {
		execFileSync("container", ["system", "status"], {
			stdio: "ignore",
			timeout: 10_000,
		});
		return true;
	} catch {
		return false;
	}
}
const hasContainerCli = containerCliAvailable();

describe("macos-vz preflight", () => {
	test("version pin format", () => {
		expect(MIN_CONTAINER_CLI).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test.if(!hasContainerCli)(
		"fails clearly when container CLI absent",
		async () => {
			const p = createMacosVzProvider(IMAGE);
			await expect(
				p.preflight({ trialWallClockMs: 1000, concurrency: 1 }),
			).rejects.toThrow(PreflightError);
		},
	);

	test.if(hasContainerCli)(
		"passes with CLI present and image loaded",
		async () => {
			const p = createMacosVzProvider(IMAGE);
			await p.preflight({ trialWallClockMs: 1000, concurrency: 1 });
		},
	);
});

describe.if(hasContainerCli)("macos-vz live (VM-per-trial)", () => {
	test("contamination: two concurrent VMs are isolated", async () => {
		const provider = createMacosVzProvider(IMAGE);
		const [a, b] = await Promise.all([
			provider.provision("vz-test-a"),
			provider.provision("vz-test-b"),
		]);
		try {
			await a.writeFile("secret.txt", "a-only");
			await a.exec(
				"mkdir -p ~/.claude/skills/x && echo s > ~/.claude/skills/x/SKILL.md",
			);
			const cross = await b.exec(
				"test -f secret.txt || test -f ~/.claude/skills/x/SKILL.md; echo $?",
			);
			expect(cross.stdout.trim()).toBe("1");
			const env = await b.exec("echo $VZ_PROBE", {
				env: { VZ_PROBE: "b-env" },
			});
			expect(env.stdout.trim()).toBe("b-env");
		} finally {
			await Promise.all([a.destroy(), b.destroy()]);
		}
	}, 300_000);
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

describe.if(hasDocker)("scheduler e2e dry run on docker (live)", () => {
	test("full trial chain with fake executor", async () => {
		const { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync } =
			await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const { buildMatrix, runMatrix } = await import(
			"../src/orchestrator/scheduler"
		);
		const { loadRegistry } = await import("../src/registry");
		const { RunConfig } = await import("../src/types");

		const base = mkdtempSync(join(tmpdir(), "he-dk-e2e-"));
		const runDir = join(base, "run-docker-dry");
		mkdirSync(join(runDir, "trials"), { recursive: true });
		const registry = loadRegistry("config/registry.yaml");
		const candidate = registry.candidates.find((c) => c.id === "superpowers");
		if (!candidate) throw new Error("missing candidate");
		const dry = {
			...candidate,
			harnesses: {
				"claude-code": {
					...candidate.harnesses["claude-code"]!,
					install: ["claude --version"],
				},
			},
		};
		const config = RunConfig.parse({
			candidates: ["superpowers"],
			trialsPerCandidate: 1,
			provider: "docker",
			concurrency: 1,
		});
		const fakeExec = async (sandbox: {
			writeFile: (p: string, c: string) => Promise<void>;
		}) => {
			await sandbox.writeFile("artifact.txt", "built-in-docker");
			return {
				records: [
					{
						sessionId: "dk-dry",
						stepIndex: 0,
						durationMs: 1000,
						numTurns: 1,
						costUsd: 0,
						usage: {
							inputTokens: 1,
							outputTokens: 1,
							cacheReadTokens: 0,
							cacheCreationTokens: 0,
						},
						isError: false,
					},
				],
				transcripts: ["{}"],
				status: "completed" as const,
				cappedBy: null,
				notes: [],
			};
		};
		const trials = await runMatrix(config, buildMatrix([dry], 1), {
			provider: createDockerProvider(IMAGE),
			registry: { ...registry, candidates: [dry] },
			runDir,
			prdContent: "# tiny PRD",
			prdSha256: "x",
			testPlanSha256: null,
			harnessVersion: "2.1.170",
			executeScript: fakeExec as never,
		});
		expect(trials[0]?.provenance.status).toBe("completed");
		expect(trials[0]?.provenance.provider).toBe("docker");
		const trialDir = join(runDir, "trials", "superpowers-t1");
		expect(existsSync(join(trialDir, "provenance.json"))).toBe(true);
		expect(
			readFileSync(join(trialDir, "workspace", "artifact.txt"), "utf8"),
		).toBe("built-in-docker");
		rmSync(base, { recursive: true, force: true });
	}, 180_000);
});

describe.if(hasContainerCli)("scheduler e2e dry run on macos-vz (live)", () => {
	test("full trial chain with fake executor", async () => {
		const { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync } =
			await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const { buildMatrix, runMatrix } = await import(
			"../src/orchestrator/scheduler"
		);
		const { loadRegistry } = await import("../src/registry");
		const { RunConfig } = await import("../src/types");

		const base = mkdtempSync(join(tmpdir(), "he-vz-e2e-"));
		const runDir = join(base, "run-vz-dry");
		mkdirSync(join(runDir, "trials"), { recursive: true });
		const registry = loadRegistry("config/registry.yaml");
		const candidate = registry.candidates.find((c) => c.id === "superpowers");
		if (!candidate) throw new Error("missing candidate");
		const dry = {
			...candidate,
			harnesses: {
				"claude-code": {
					...candidate.harnesses["claude-code"]!,
					install: ["claude --version"],
				},
			},
		};
		const config = RunConfig.parse({
			candidates: ["superpowers"],
			trialsPerCandidate: 1,
			provider: "macos-vz",
			concurrency: 1,
		});
		const fakeExec = async (sandbox: {
			writeFile: (p: string, c: string) => Promise<void>;
		}) => {
			await sandbox.writeFile("artifact.txt", "built-in-vz");
			return {
				records: [
					{
						sessionId: "vz-dry",
						stepIndex: 0,
						durationMs: 1000,
						numTurns: 1,
						costUsd: 0,
						usage: {
							inputTokens: 1,
							outputTokens: 1,
							cacheReadTokens: 0,
							cacheCreationTokens: 0,
						},
						isError: false,
					},
				],
				transcripts: ["{}"],
				status: "completed" as const,
				cappedBy: null,
				notes: [],
			};
		};
		const { createMacosVzProvider: mk } = await import(
			"../src/providers/macos-vz"
		);
		const trials = await runMatrix(config, buildMatrix([dry], 1), {
			provider: mk(IMAGE),
			registry: { ...registry, candidates: [dry] },
			runDir,
			prdContent: "# tiny PRD",
			prdSha256: "x",
			testPlanSha256: null,
			harnessVersion: "2.1.170",
			executeScript: fakeExec as never,
		});
		expect(trials[0]?.provenance.status).toBe("completed");
		expect(trials[0]?.provenance.provider).toBe("macos-vz");
		expect(
			readFileSync(
				join(runDir, "trials", "superpowers-t1", "workspace", "artifact.txt"),
				"utf8",
			),
		).toBe("built-in-vz");
		rmSync(base, { recursive: true, force: true });
	}, 300_000);
});
