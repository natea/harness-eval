import { describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	loadTarget,
	renderTargetPrompt,
	scaffoldTarget,
	TargetError,
} from "../src/targets";

const tmp = mkdtempSync(join(tmpdir(), "he-targets-"));

// Minimal catalog metadata (required since extend-prd-library) for inline
// manifests whose tests target a LATER validation step.
const CAT =
	"summary: s\ndescription: d\ntags:\n  domain: x\n  shape: y\n  expectedUI: none\n";

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
			`name: noattest\nversion: "1"\n${CAT}prdFile: PRD.md\nprdSha256: ${sha}\ntestplanFile: tp.yaml\nconformanceSection: all\ncoverageMode: attested\ncoldStartContract: ["run.sh"]\n`,
		);
		expect(() => loadTarget("noattest", tmp)).toThrow(/attestation/);
	});

	test("unknown target lists available", () => {
		expect(() => loadTarget("nope")).toThrow(/available/);
	});

	test("adapted target missing a source field fails validation (spec scenario, task 1.5)", () => {
		const root = join(tmp, "prov-missing-field");
		mkdirSync(join(root, "adapted"), { recursive: true });
		writeFileSync(join(root, "NOTICE"), "x\n");
		writeFileSync(join(root, "adapted", "PRD.md"), "# p\n");
		const sha = new Bun.CryptoHasher("sha256").update("# p\n").digest("hex");
		writeFileSync(
			join(root, "adapted", "tp.yaml"),
			`version: "1"\nprdSha256: ${sha}\nsteps:\n  - id: A\n    covers: ["1"]\n    description: d\n    check: c\n`,
		);
		// `source` declared with `upstream` but missing commit/originalDir/license.
		writeFileSync(
			join(root, "adapted", "target.yaml"),
			`name: adapted\nversion: "1"\n${CAT}prdFile: PRD.md\nprdSha256: ${sha}\ntestplanFile: tp.yaml\nconformanceSection: all\ncoverageMode: attested\nattestation: ok\ncoldStartContract: ["run.sh"]\nsource:\n  upstream: vibench-public\n  repo: https://github.com/ViBench/vibench-public\n`,
		);
		expect(() => loadTarget("adapted", root)).toThrow(/source/);
	});

	test("adapted target with full source but no NOTICE fails (preserve notices, task 1.5)", () => {
		const root = join(tmp, "prov-no-notice");
		mkdirSync(join(root, "adapted"), { recursive: true });
		writeFileSync(join(root, "adapted", "PRD.md"), "# p\n");
		const sha = new Bun.CryptoHasher("sha256").update("# p\n").digest("hex");
		writeFileSync(
			join(root, "adapted", "tp.yaml"),
			`version: "1"\nprdSha256: ${sha}\nsteps:\n  - id: A\n    covers: ["1"]\n    description: d\n    check: c\n`,
		);
		writeFileSync(
			join(root, "adapted", "target.yaml"),
			`name: adapted\nversion: "1"\n${CAT}prdFile: PRD.md\nprdSha256: ${sha}\ntestplanFile: tp.yaml\nconformanceSection: all\ncoverageMode: attested\nattestation: ok\ncoldStartContract: ["run.sh"]\nsource:\n  upstream: vibench-public\n  repo: https://github.com/ViBench/vibench-public\n  commit: abc1234\n  originalDir: prds/barber\n  license: Apache-2.0\n`,
		);
		expect(() => loadTarget("adapted", root)).toThrow(/NOTICE/);
	});

	test("scaffoldTarget writes PRD + skeleton, hash-bound, refuses overwrite (task 2.1)", () => {
		const root = join(tmp, "scaffold");
		mkdirSync(root, { recursive: true });
		const spec = join(root, "my-spec.md");
		writeFileSync(spec, "# My API\n\nDo the thing.\n");
		const r = scaffoldTarget("my-api", spec, root);

		expect(r.files).toHaveLength(3);
		const expectedSha = new Bun.CryptoHasher("sha256")
			.update("# My API\n\nDo the thing.\n")
			.digest("hex");
		expect(r.prdSha256).toBe(expectedSha);
		// testplan + manifest both carry the PRD hash so freeze binding holds.
		const manifest = readFileSync(join(r.dir, "target.yaml"), "utf8");
		const testplan = readFileSync(join(r.dir, "testplan.yaml"), "utf8");
		expect(manifest).toContain(expectedSha);
		expect(testplan).toContain(expectedSha);
		// Skeleton is intentionally not run-eligible: TODO placeholders remain
		// and attested coverage has no attestation yet, so validation blocks it.
		expect(manifest).toContain("TODO");
		expect(() => loadTarget("my-api", root)).toThrow(/attestation/);

		// Refuses to clobber an existing target.
		expect(() => scaffoldTarget("my-api", spec, root)).toThrow(
			/already exists/,
		);
		// Rejects bad names and missing specs.
		expect(() => scaffoldTarget("Bad Name", spec, root)).toThrow(
			/invalid target name/,
		);
		expect(() => scaffoldTarget("x", join(root, "nope.md"), root)).toThrow(
			/not found/,
		);
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

	test("catalog metadata is required on load (extend-prd-library task 1.3)", () => {
		const root = join(tmp, "no-catalog");
		mkdirSync(join(root, "t"), { recursive: true });
		writeFileSync(join(root, "t", "PRD.md"), "# p\n");
		const sha = new Bun.CryptoHasher("sha256").update("# p\n").digest("hex");
		writeFileSync(
			join(root, "t", "tp.yaml"),
			`version: "1"\nprdSha256: ${sha}\nsteps:\n  - id: A\n    covers: ["1"]\n    description: d\n    check: c\n`,
		);
		// Manifest omits summary/description/tags entirely.
		writeFileSync(
			join(root, "t", "target.yaml"),
			`name: t\nversion: "1"\nprdFile: PRD.md\nprdSha256: ${sha}\ntestplanFile: tp.yaml\nconformanceSection: all\ncoverageMode: attested\nattestation: ok\ncoldStartContract: ["run.sh"]\n`,
		);
		expect(() => loadTarget("t", root)).toThrow(/summary|description|tags/);
	});

	test("loaded targets expose catalog metadata for selection (task 1.2)", () => {
		const t = loadTarget("web-app");
		expect(t.manifest.summary.length).toBeGreaterThan(0);
		expect(t.manifest.tags.expectedUI).toBe("served-page");
		expect(t.manifest.tags.shape.length).toBeGreaterThan(0);
	});

	test("catalog metadata never leaks into the rendered prompt (fairness, task 1.5)", () => {
		const t = loadTarget("web-app");
		// Render with EVERY known slot present so we test the real template surface.
		const out = renderTargetPrompt(
			"{{PRD_FILE}} {{CONFORMANCE}} {{DELIVERABLES}} {{NOTES}} {{DESIGN}}",
			t,
		);
		// The distinctive catalog strings must never appear verbatim in the prompt.
		// (Individual tag tokens like "scheduling" can legitimately occur in PRD
		// prose, so we assert on the full summary/description, which are unique.)
		expect(out).not.toContain(t.manifest.summary);
		expect(out).not.toContain(t.manifest.description.trim());
	});
});
