import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTarget, renderTargetPrompt, TargetError } from "../src/targets";

const tmp = mkdtempSync(join(tmpdir(), "he-targets-"));

describe("eval targets (add-prd-library)", () => {
	test("symphony-daemon migration preserves hashes (task 1.2 / spec scenario)", () => {
		const t = loadTarget("symphony-daemon");
		expect(t.prdSha256).toBe(
			"fa9d7c252cc72d10afdaf4e46e0d890aae28cf4331dc531c94413bc8ea199452",
		);
		expect(t.plan.steps).toHaveLength(22);
	});

	test("PRD hash drift fails the load", () => {
		cpSync("targets/symphony-daemon", join(tmp, "drifted"), {
			recursive: true,
		});
		writeFileSync(join(tmp, "drifted", "PRD.md"), "tampered");
		expect(() => loadTarget("drifted", tmp)).toThrow(/hash drift/);
	});

	test("attested coverage without attestation blocks (spec scenario)", () => {
		mkdirSync(join(tmp, "noattest"), { recursive: true });
		writeFileSync(join(tmp, "noattest", "PRD.md"), "# p\n");
		const sha = new Bun.CryptoHasher("sha256").update("# p\n").digest("hex");
		writeFileSync(
			join(tmp, "noattest", "tp.yaml"),
			`version: "1"\nprdSha256: ${sha}\nsteps:\n  - id: A\n    covers: ["1"]\n    description: d\n    check: c\n`,
		);
		writeFileSync(
			join(tmp, "noattest", "target.yaml"),
			`name: noattest\nversion: "1"\nprdFile: PRD.md\nprdSha256: ${sha}\ntestplanFile: tp.yaml\nconformanceSection: all\ncoverageMode: attested\ncoldStartContract: ["run.sh"]\n`,
		);
		expect(() => loadTarget("noattest", tmp)).toThrow(/attestation/);
	});

	test("unknown target lists available", () => {
		expect(() => loadTarget("nope")).toThrow(/available/);
	});

	test("prompt rendering fills all slots identically for any candidate", () => {
		const t = loadTarget("symphony-daemon");
		const out = renderTargetPrompt(
			"X {{PRD_FILE}} Y {{CONFORMANCE}} Z\n{{DELIVERABLES}}\n{{NOTES}}",
			t,
		);
		expect(out).toContain("SPEC.md");
		expect(out).toContain("18.1");
		expect(out).toContain("setup.sh");
		expect(out).not.toContain("{{");
	});
});
