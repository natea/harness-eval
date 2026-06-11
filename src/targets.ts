import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { loadTestPlan } from "./grading/testplan";
import type { TestPlan } from "./types";

export const FixtureDef = z.object({
	name: z.string(),
	command: z.string().optional(),
	pathOnly: z.string().optional(),
	envVar: z.string(),
	urlTemplate: z.string().optional(),
});
export type FixtureDef = z.infer<typeof FixtureDef>;

export const TargetManifest = z.object({
	name: z.string().regex(/^[a-z0-9-]+$/),
	version: z.string(),
	prdFile: z.string(),
	prdSha256: z.string().length(64),
	testplanFile: z.string(),
	conformanceSection: z.string(),
	coverageMode: z.enum(["spec-checklist", "attested"]),
	/** Required when coverageMode is `attested` (eval-targets spec). */
	attestation: z.string().optional(),
	coldStartContract: z.array(z.string()).min(1),
	deliverableNotes: z.string().default(""),
	fixtures: z.array(FixtureDef).default([]),
});
export type TargetManifest = z.infer<typeof TargetManifest>;

export class TargetError extends Error {}

export interface LoadedTarget {
	manifest: TargetManifest;
	dir: string;
	prdContent: string;
	prdSha256: string;
	plan: TestPlan;
	testPlanSha256: string;
}

/**
 * Load and validate an eval target (eval-targets spec): manifest schema,
 * PRD hash freshness, coverage-mode obligations, test-plan freeze binding.
 */
export function loadTarget(name: string, targetsDir = "targets"): LoadedTarget {
	const dir = resolve(targetsDir, name);
	const manifestPath = join(dir, "target.yaml");
	if (!existsSync(manifestPath)) {
		const available = existsSync(targetsDir)
			? require("node:fs")
					.readdirSync(targetsDir)
					.filter((d: string) => existsSync(join(targetsDir, d, "target.yaml")))
			: [];
		throw new TargetError(
			`no target '${name}' (available: ${available.join(", ") || "none"})`,
		);
	}
	const parsed = TargetManifest.safeParse(
		parse(readFileSync(manifestPath, "utf8")),
	);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  ${i.path.join(".")}: ${i.message}`)
			.join("\n");
		throw new TargetError(
			`invalid target manifest ${manifestPath}:\n${issues}`,
		);
	}
	const manifest = parsed.data;

	if (manifest.coverageMode === "attested" && !manifest.attestation?.trim()) {
		throw new TargetError(
			`target '${name}' uses attested coverage but has no attestation — add a human coverage sign-off to target.yaml`,
		);
	}

	const prdContent = readFileSync(join(dir, manifest.prdFile), "utf8");
	const prdSha256 = createHash("sha256").update(prdContent).digest("hex");
	if (prdSha256 !== manifest.prdSha256) {
		throw new TargetError(
			`target '${name}' PRD hash drift: manifest ${manifest.prdSha256.slice(0, 12)}… vs file ${prdSha256.slice(0, 12)}… — re-freeze deliberately or restore the PRD`,
		);
	}

	// spec-checklist coverage validation only applies to targets whose plan
	// maps a declared REQUIRED checklist (currently symphony-daemon's loader
	// rule); attested targets skip the programmatic mapping.
	const { plan, sha256: testPlanSha256 } =
		manifest.coverageMode === "spec-checklist" && name === "symphony-daemon"
			? loadTestPlan(join(dir, manifest.testplanFile), prdSha256)
			: loadGenericTestPlan(join(dir, manifest.testplanFile), prdSha256);

	return { manifest, dir, prdContent, prdSha256, plan, testPlanSha256 };
}

function loadGenericTestPlan(path: string, expectedPrdSha256: string) {
	const raw = readFileSync(path, "utf8");
	const sha256 = createHash("sha256").update(raw).digest("hex");
	const plan = (require("./types") as typeof import("./types")).TestPlan.parse(
		parse(raw),
	);
	if (plan.prdSha256 !== expectedPrdSha256) {
		throw new TargetError(
			`test plan targets PRD ${plan.prdSha256.slice(0, 12)}… but target PRD is ${expectedPrdSha256.slice(0, 12)}…`,
		);
	}
	return { plan, sha256 };
}

/** Render the registry's base-prompt template with this target's slots. */
export function renderTargetPrompt(template: string, t: LoadedTarget): string {
	return template
		.replaceAll(
			"{{PRD_FILE}}",
			t.manifest.prdFile === "PRD.md" ? "SPEC.md" : t.manifest.prdFile,
		)
		.replaceAll("{{CONFORMANCE}}", t.manifest.conformanceSection)
		.replaceAll(
			"{{DELIVERABLES}}",
			t.manifest.coldStartContract.map((c) => `- ${c}`).join("\n"),
		)
		.replaceAll("{{NOTES}}", t.manifest.deliverableNotes.trim());
}

export interface RunningFixture {
	name: string;
	envVar: string;
	value: string;
	proc?: { kill: () => void };
}

/** Start manifest-declared fixture processes for one grading session (design D4). */
export function startFixtures(
	t: LoadedTarget,
	basePort: number,
): RunningFixture[] {
	const running: RunningFixture[] = [];
	let port = basePort;
	for (const f of t.manifest.fixtures) {
		const sub = (s: string) =>
			s.replaceAll("{targetDir}", t.dir).replaceAll("{port}", String(port));
		if (f.pathOnly) {
			running.push({ name: f.name, envVar: f.envVar, value: sub(f.pathOnly) });
			continue;
		}
		if (!f.command) continue;
		const parts = sub(f.command).split(/\s+/);
		const proc = Bun.spawn(parts, { stdout: "ignore", stderr: "ignore" });
		running.push({
			name: f.name,
			envVar: f.envVar,
			value: f.urlTemplate ? sub(f.urlTemplate) : String(port),
			proc,
		});
		port++;
	}
	return running;
}

export function stopFixtures(fixtures: RunningFixture[]): void {
	for (const f of fixtures) f.proc?.kill();
}
