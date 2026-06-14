import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesignError, listDesigns, loadDesign } from "../src/designs";
import {
	deltaE,
	extractRealizedTokens,
	scoreDesignAdherence,
} from "../src/grading/design-adherence";

const tmp = mkdtempSync(join(tmpdir(), "he-design-"));

describe("design catalog + adherence (add-design-adherence)", () => {
	test("catalog loads vendored designs with hash + provenance (1.1/1.2)", () => {
		expect(listDesigns()).toEqual(expect.arrayContaining(["linear", "notion"]));
		const linear = loadDesign("linear");
		expect(linear.sha256).toHaveLength(64);
		expect(Object.keys(linear.spec.colors).length).toBeGreaterThan(10);
		expect(linear.source.upstream).toBe("awesome-design-md");
		expect(linear.source.license).toBe("MIT");
		expect(linear.source.commit.length).toBeGreaterThanOrEqual(7);
	});

	test("unknown design lists available", () => {
		expect(() => loadDesign("ghost")).toThrow(/available/);
	});

	test("a design without a provenance entry fails to load", () => {
		const root = join(tmp, "no-prov");
		mkdirSync(join(root, "orphan"), { recursive: true });
		writeFileSync(join(root, "NOTICE"), "x\n");
		writeFileSync(
			join(root, "provenance.yaml"),
			"upstream: x\nrepo: https://example.com\ncommit: abc1234\nlicense: MIT\ndesigns: {}\n",
		);
		writeFileSync(
			join(root, "orphan", "DESIGN.md"),
			"---\nname: Orphan\ncolors:\n  primary: \"#112233\"\n---\n# x\n",
		);
		expect(() => loadDesign("orphan", root)).toThrow(DesignError);
	});

	test("ΔE is perceptual: identical 0, near small, far large", () => {
		expect(deltaE("#5e6ad2", "#5e6ad2")).toBe(0);
		expect(deltaE("#5e6ad2", "#5e69d1") ?? 99).toBeLessThan(3);
		expect(deltaE("#000000", "#ffffff") ?? 0).toBeGreaterThan(90);
		expect(deltaE("notacolor", "#fff")).toBeNull();
	});

	test("token extraction finds hex colors + font families (3.1)", () => {
		const ws = join(tmp, "ws-extract");
		mkdirSync(join(ws, "src"), { recursive: true });
		writeFileSync(
			join(ws, "src", "theme.css"),
			":root{--primary:#5E6AD2;--bg:#0f1011}\nbody{font-family:'Inter', sans-serif;color:#F7F8F8}",
		);
		mkdirSync(join(ws, "node_modules", "junk"), { recursive: true });
		writeFileSync(join(ws, "node_modules", "junk", "x.css"), "a{color:#abcdef}");
		const r = extractRealizedTokens(ws);
		expect(r.colors).toContain("#5e6ad2"); // normalized lowercase
		expect(r.colors).toContain("#0f1011");
		expect(r.fonts).toContain("inter");
		expect(r.colors).not.toContain("#abcdef"); // node_modules skipped
	});

	test("scoring: a faithful palette beats an off-spec one (3.2)", () => {
		const linear = loadDesign("linear");

		// Faithful: a stylesheet built from linear's own palette + display font.
		const good = join(tmp, "ws-good");
		mkdirSync(good, { recursive: true });
		const palette = Object.values(linear.spec.colors).join(";");
		writeFileSync(
			join(good, "app.css"),
			`:root{${palette}}\nbody{font-family:"Linear Display", sans-serif}`,
		);

		// Off-spec: unrelated colors.
		const bad = join(tmp, "ws-bad");
		mkdirSync(bad, { recursive: true });
		writeFileSync(
			join(bad, "app.css"),
			"body{color:#ff3300;background:#00cc66;border-color:#ffaa00}",
		);

		const g = scoreDesignAdherence(good, linear.spec);
		const b = scoreDesignAdherence(bad, linear.spec);
		expect(g.color.score).toBeGreaterThan(90);
		expect(g.typography.score).toBeGreaterThan(0); // Linear Display matched
		expect(g.score).toBeGreaterThan(b.score);
		expect(b.color.score).toBeLessThan(40);
		// Evidence: matched/missed tokens recorded.
		expect(g.color.matches.some((m) => m.matched && m.nearest)).toBe(true);
	});

	test("font aliases credit proprietary→open substitutions (4.3 tuning)", () => {
		const linear = loadDesign("linear");
		// linear's provenance maps "Linear Display"/"Linear Text" → Inter.
		expect(linear.fontAliases["linear display"]).toContain("inter");

		const ws = join(tmp, "ws-inter");
		mkdirSync(ws, { recursive: true });
		writeFileSync(
			join(ws, "app.css"),
			'body{font-family:"Inter",sans-serif}\ncode{font-family:"JetBrains Mono"}',
		);

		// Without aliases the faithful Inter build scores 0 on type (exact-name miss);
		// with aliases it is fully credited.
		expect(scoreDesignAdherence(ws, linear.spec).typography.score).toBe(0);
		expect(
			scoreDesignAdherence(ws, linear.spec, linear.fontAliases).typography.score,
		).toBe(100);
	});
});
