/**
 * Unit tests for the E2B provider (add-e2b-sandbox-provider task 3.1): enum/CLI
 * plumbing + the preflight failure paths, with the e2b SDK mocked so nothing
 * touches the network. The "template won't start" path is exercised by mocking
 * `Sandbox.create` to throw — which is also exactly what a missing/un-built
 * template does in the wild.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { PreflightError } from "../src/providers/types";

// Mock the e2b SDK BEFORE importing anything that loads it, so `Sandbox.create`
// never reaches the network. `types` carries no SDK import, so it stays real.
mock.module("e2b", () => ({
	Sandbox: {
		create: async () => {
			throw new Error("404: template 'x' not found");
		},
	},
}));
const { createProvider } = await import("../src/providers/factory");

const KEY = "E2B_API_KEY";
let saved: string | undefined;
beforeEach(() => {
	saved = process.env[KEY];
});
afterEach(() => {
	if (saved === undefined) delete process.env[KEY];
	else process.env[KEY] = saved;
});

// biome-ignore lint/suspicious/noExplicitAny: minimal PreflightContext for the test
const ctx = (trialWallClockMs: number): any => ({ trialWallClockMs });

describe("e2b provider plumbing", () => {
	test("createProvider('e2b') builds an E2B provider with the snapshot/template", () => {
		process.env[KEY] = "dummy-key";
		const p = createProvider("e2b", {
			snapshot: "harness-eval-base:v4",
			e2bTier: "hobby",
		});
		expect(p.id).toBe("e2b");
		expect(p.snapshotId).toBe("harness-eval-base:v4");
	});

	test("missing E2B_API_KEY fails fast with a PreflightError", () => {
		delete process.env[KEY];
		expect(() => createProvider("e2b", {})).toThrow(PreflightError);
		expect(() => createProvider("e2b", {})).toThrow(/E2B_API_KEY/);
	});
});

describe("e2b preflight failure paths", () => {
	test("tier max-lifetime < trial budget hard-fails with tier guidance (no SDK call)", async () => {
		process.env[KEY] = "dummy-key";
		const p = createProvider("e2b", { e2bTier: "hobby" });
		// hobby cap = 1h; 50m trial + 15m default setup margin = 65m > 60m → throws
		// at the tier gate, before any Sandbox.create.
		await expect(p.preflight(ctx(50 * 60 * 1000))).rejects.toThrow(
			/tier max sandbox lifetime/,
		);
	});

	test("a budget the hobby tier rejects is admitted by pro (reaches the SDK probe)", async () => {
		process.env[KEY] = "dummy-key";
		const p = createProvider("e2b", { e2bTier: "pro" });
		// pro cap = 24h; the same 50m budget clears the tier gate, so preflight
		// proceeds to the template probe (mocked to throw) — NOT the tier error.
		await expect(p.preflight(ctx(50 * 60 * 1000))).rejects.not.toThrow(
			/tier max sandbox lifetime/,
		);
	});

	test("a template that won't start wraps as a PreflightError with the build hint", async () => {
		process.env[KEY] = "dummy-key";
		const p = createProvider("e2b", { e2bTier: "hobby" });
		// Under the hobby cap → reaches the (mocked, throwing) Sandbox.create.
		await expect(p.preflight(ctx(10 * 60 * 1000))).rejects.toThrow(
			/build it per infra\/e2b-template/,
		);
	});
});
