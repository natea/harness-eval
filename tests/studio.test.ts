import { describe, expect, test } from "bun:test";
import { resolveCandidates } from "../src/registry";
import { loadRegistry } from "../src/registry";
import {
	cliCommand,
	studioOptions,
	validateRunRequest,
} from "../src/studio/options";

const VALID = {
	target: "web-app",
	candidates: ["gsd"],
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

describe("eval-studio options + validation (tasks 3.1, 4.1)", () => {
	test("studioOptions exposes the live registries", () => {
		const o = studioOptions();
		expect(o.targets).toContain("symphony-daemon");
		expect(o.candidates.map((c) => c.id)).toContain("gsd");
		expect(o.providers).toContain("worktree");
		expect(o.models.map((m) => m.name)).toContain("claude-opus-4-6");
		// GLM/Kimi/etc. are in the registry too.
		expect(o.models.map((m) => m.name)).toContain("glm-4.7");
	});

	test("a valid request produces the CLI command + budget, no errors", () => {
		const r = validateRunRequest(VALID);
		expect(r.errors).toEqual([]);
		expect(r.command).toContain("--target web-app");
		expect(r.command).toContain("--candidates gsd");
		expect(r.budget?.totalTrials).toBe(1);
		expect(r.budget?.maxCostUsd).toBeGreaterThan(0);
	});

	test("rejects empty candidate selection", () => {
		const r = validateRunRequest({ ...VALID, candidates: [] });
		expect(r.errors.some((e) => /at least one/.test(e))).toBe(true);
		expect(r.command).toBeUndefined();
	});

	test("rejects an unknown candidate", () => {
		const r = validateRunRequest({ ...VALID, candidates: ["nope"] });
		expect(r.errors.some((e) => /not in the registry/.test(e))).toBe(true);
	});

	test("rejects an unknown target / provider / worker model", () => {
		expect(
			validateRunRequest({ ...VALID, target: "ghost" }).errors.some((e) =>
				/target/.test(e),
			),
		).toBe(true);
		expect(
			validateRunRequest({ ...VALID, provider: "ec2" }).errors.some((e) =>
				/provider/.test(e),
			),
		).toBe(true);
		expect(
			validateRunRequest({ ...VALID, workerModel: "llama-9000" }).errors.some(
				(e) => /workerModel/.test(e),
			),
		).toBe(true);
	});

	test("candidate-without-harness rejection MIRRORS the CLI (registry parity)", () => {
		// No candidate has an 'opencode' section, so both paths must reject.
		const registry = loadRegistry("config/registry.yaml");
		let cliThrew = false;
		try {
			resolveCandidates(registry, ["gsd"], "opencode" as never);
		} catch {
			cliThrew = true;
		}
		const studio = validateRunRequest({
			...VALID,
			harness: "opencode",
		});
		expect(cliThrew).toBe(true);
		expect(studio.errors.some((e) => /no 'opencode' section/.test(e))).toBe(
			true,
		);
	});

	test("rejects weights that don't sum to 1 (RunConfig parity)", () => {
		const r = validateRunRequest({
			...VALID,
			weights: {
				prdAdherence: 0.5,
				codeQuality: 0.5,
				speed: 0.5,
				tokenSpend: 0.5,
			},
		});
		expect(r.errors.some((e) => /config|weights/.test(e))).toBe(true);
	});

	test("cliCommand omits the default worker model, includes overrides + grade", () => {
		expect(cliCommand({ ...VALID, workerModel: "claude-opus-4-6" })).not.toContain(
			"--worker-model",
		);
		const glm = cliCommand({ ...VALID, workerModel: "glm-4.7", grade: true });
		expect(glm).toContain("--worker-model glm-4.7");
		expect(glm).toContain("--grade");
	});
});
