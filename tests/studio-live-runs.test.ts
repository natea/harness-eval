import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SessionScriptResult } from "../src/driver/session";
import { cancelRun, getQueue, launchRun } from "../src/studio/launcher";
import {
	cliCommand,
	defaultConcurrency,
	type StudioRunRequest,
} from "../src/studio/options";
import { operatorPolicy, resolveLaunchPolicy } from "../src/studio/policy";

const REQ: StudioRunRequest = {
	target: "cli-tool",
	candidates: ["superpowers"],
	harness: "claude-code",
	workerModel: "claude-opus-4-6",
	provider: "worktree",
	trials: 1,
	weights: {
		prdAdherence: 0.4,
		codeQuality: 0.25,
		speed: 0.175,
		tokenSpend: 0.175,
	},
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const createdRuns: string[] = [];
afterAll(() => {
	for (const id of createdRuns)
		rmSync(join("runs", id), { recursive: true, force: true });
});

// A fake session executor: writes a tiny artifact, zero spend.
const fakeExecutor = async (sandbox: {
	writeFile: (p: string, c: string) => Promise<void>;
}): Promise<SessionScriptResult> => {
	await sandbox.writeFile("setup.sh", "#!/bin/sh\nexit 0\n");
	await sandbox.writeFile("app.js", "console.log('hi')\n");
	return {
		records: [
			{
				sessionId: "live-test",
				stepIndex: 0,
				durationMs: 1000,
				numTurns: 1,
				costUsd: 0.07,
				usage: {
					inputTokens: 10,
					outputTokens: 5,
					cacheReadTokens: 0,
					cacheCreationTokens: 0,
				},
				isError: false,
			},
		],
		transcripts: ["{}"],
		status: "completed",
		cappedBy: null,
		notes: [],
	};
};

describe("add-studio-live-runs: concurrency defaults (free-tier safety)", () => {
	test("daytona defaults to concurrency 1, others to 2", () => {
		expect(defaultConcurrency("daytona")).toBe(1);
		expect(defaultConcurrency("docker")).toBe(2);
		expect(defaultConcurrency("worktree")).toBe(2);
		expect(defaultConcurrency(undefined)).toBe(2);
	});

	test("CLI command reflects a non-default concurrency", () => {
		expect(cliCommand({ ...REQ, provider: "daytona" })).toContain(
			"--concurrency 1",
		);
		expect(cliCommand({ ...REQ, provider: "docker" })).not.toContain(
			"--concurrency",
		);
	});
});

describe("add-studio-live-runs: authorization seam (1.x, 5.1)", () => {
	test("default policy allows when no operator token is configured", async () => {
		const d = await operatorPolicy(undefined).canLaunch(
			{ id: "operator" },
			REQ,
		);
		expect(d.ok).toBe(true);
	});

	test("operator token required + validated when configured", async () => {
		const p = operatorPolicy("s3cret");
		expect((await p.canLaunch({ id: "operator" }, REQ)).ok).toBe(false);
		expect(
			(await p.canLaunch({ id: "operator", token: "wrong" }, REQ)).ok,
		).toBe(false);
		expect(
			(await p.canLaunch({ id: "operator", token: "s3cret" }, REQ)).ok,
		).toBe(true);
	});

	test("resolveLaunchPolicy reads STUDIO_OPERATOR_TOKEN from env", async () => {
		const p = resolveLaunchPolicy({ STUDIO_OPERATOR_TOKEN: "abc" });
		expect((await p.canLaunch({ id: "operator" }, REQ)).ok).toBe(false);
		const open = resolveLaunchPolicy({});
		expect((await open.canLaunch({ id: "operator" }, REQ)).ok).toBe(true);
	});
});

describe("add-studio-live-runs: gating + spend-safety (3.x, 5.1, 5.3)", () => {
	test("a real launch without confirmation returns the budget, provisions nothing", async () => {
		let providerMade = false;
		const out = await launchRun(REQ, {
			dryRun: false,
			makeProvider: () => {
				providerMade = true;
				throw new Error("must not provision");
			},
		});
		expect("needsConfirmation" in out).toBe(true);
		if ("needsConfirmation" in out) expect(out.budget?.totalTrials).toBe(1);
		expect(providerMade).toBe(false);
	});

	test("a denied real launch returns the reason, provisions nothing", async () => {
		let providerMade = false;
		const out = await launchRun(
			{ ...REQ, confirmed: true },
			{
				dryRun: false,
				policy: {
					async canLaunch() {
						return { ok: false, reason: "no credits" };
					},
				},
				makeProvider: () => {
					providerMade = true;
					throw new Error("must not provision");
				},
			},
		);
		expect("errors" in out && out.errors[0]).toBe("no credits");
		expect(providerMade).toBe(false);
	});

	test("no real session/provider is constructed unless ALL four gates pass", async () => {
		// invalid request (gate 1: validation) — never provisions
		let made = 0;
		const mk = () => {
			made++;
			throw new Error("nope");
		};
		await launchRun(
			{ ...REQ, candidates: [] },
			{ dryRun: false, makeProvider: mk },
		);
		await launchRun(REQ, { dryRun: false, makeProvider: mk }); // unconfirmed
		await launchRun(
			{ ...REQ, confirmed: true },
			{
				dryRun: false,
				makeProvider: mk,
				policy: {
					async canLaunch() {
						return { ok: false, reason: "x" };
					},
				},
			},
		);
		expect(made).toBe(0);
	});
});

describe("add-studio-live-runs: live job lifecycle (2.x, 5.2)", () => {
	test("authorized + confirmed live run executes the full lifecycle with no spend", async () => {
		const onLaunched: string[] = [];
		const onSettled: string[] = [];
		const out = await launchRun(
			{ ...REQ, confirmed: true },
			{
				dryRun: false,
				executeScript: fakeExecutor as never,
				policy: {
					async canLaunch() {
						return { ok: true };
					},
					async onLaunched(_p, runId) {
						onLaunched.push(runId);
					},
					async onSettled(_p, runId, outcome) {
						onSettled.push(`${runId}:${outcome.status}`);
					},
				},
			},
		);
		expect("runId" in out).toBe(true);
		const id = (out as { runId: string }).runId;
		createdRuns.push(id);

		let entry = getQueue().find((e) => e.runId === id);
		expect(entry?.kind).toBe("live");
		for (let i = 0; i < 60 && entry?.status === "running"; i++) {
			await sleep(500);
			entry = getQueue().find((e) => e.runId === id);
		}
		expect(entry?.status).toBe("completed");
		expect(Object.values(entry?.trials ?? {})).toContain("completed");
		expect(entry?.costUsdSoFar).toBeCloseTo(0.07, 5);
		expect(onLaunched).toContain(id);
		expect(onSettled).toContain(`${id}:completed`);

		const runDir = join("runs", id);
		expect(existsSync(join(runDir, "results.json"))).toBe(true);
		expect(existsSync(join(runDir, "scorecard.md"))).toBe(true);
		const results = JSON.parse(
			readFileSync(join(runDir, "results.json"), "utf8"),
		);
		expect(results.trials[0].provenance.status).toBe("completed");
	}, 40_000);

	test("cancel before completion ends in the cancelled state", async () => {
		// A slow executor so we can cancel mid-flight.
		const slow = async (sandbox: {
			writeFile: (p: string, c: string) => Promise<void>;
		}): Promise<SessionScriptResult> => {
			await sandbox.writeFile("setup.sh", "#!/bin/sh\nexit 0\n");
			await sleep(1500);
			return fakeExecutor(sandbox);
		};
		const out = await launchRun(
			{ ...REQ, trials: 2, confirmed: true },
			{
				dryRun: false,
				executeScript: slow as never,
				policy: {
					async canLaunch() {
						return { ok: true };
					},
				},
			},
		);
		const id = (out as { runId: string }).runId;
		createdRuns.push(id);
		await sleep(300);
		expect(cancelRun(id).ok).toBe(true);

		let entry = getQueue().find((e) => e.runId === id);
		for (let i = 0; i < 60 && entry?.status === "running"; i++) {
			await sleep(500);
			entry = getQueue().find((e) => e.runId === id);
		}
		expect(entry?.status).toBe("cancelled");
		// cancelling an already-terminal run is rejected
		expect(cancelRun(id).ok).toBe(false);
		expect(cancelRun("no-such-run").ok).toBe(false);
	}, 40_000);
});
