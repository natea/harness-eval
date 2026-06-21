import { describe, expect, test } from "bun:test";
import {
	checkCatalog,
	generateCatalog,
	loadCatalog,
	renderCatalog,
	targetNames,
} from "../src/catalog";

describe("target catalog (extend-prd-library)", () => {
	test("catalog has one entry per shipped target", () => {
		const names = targetNames();
		const entries = loadCatalog();
		expect(entries.map((e) => e.name).sort()).toEqual([...names].sort());
		expect(entries.length).toBeGreaterThanOrEqual(4);
	});

	test("every entry carries selection metadata", () => {
		for (const e of loadCatalog()) {
			expect(e.summary.length).toBeGreaterThan(0);
			expect(e.shape.length).toBeGreaterThan(0);
			expect(["none", "served-page", "interactive"]).toContain(e.expectedUI);
		}
	});

	test("generation is deterministic (stable output)", () => {
		expect(generateCatalog()).toBe(generateCatalog());
	});

	test("committed docs/TARGETS.md is not stale", () => {
		expect(checkCatalog().stale).toBe(false);
	});

	test("drift check fires when a manifest's metadata changes", () => {
		const real = loadCatalog();
		// Simulate a manifest edit that wasn't regenerated into the doc: render
		// with a mutated summary and compare against the committed file.
		const mutated = renderCatalog(
			real.map((e, i) => (i === 0 ? { ...e, summary: "CHANGED SUMMARY" } : e)),
		);
		const committed = checkCatalog().actual;
		expect(committed).not.toBeNull();
		expect(mutated).not.toBe(committed);
	});
});
