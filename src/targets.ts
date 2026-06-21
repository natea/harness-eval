import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Upstream attribution for a target adapted from a third-party source
 * (eval-targets spec: "Upstream attribution for adapted targets"). When a
 * manifest declares `source`, every field is required so attribution can't be
 * dropped silently — e.g. ViBench PRDs are Apache-2.0 and must carry provenance
 * plus the `targets/NOTICE` text.
 */
export const SourceProvenance = z.object({
	upstream: z.string().min(1),
	repo: z.string().url(),
	commit: z.string().min(7),
	originalDir: z.string().min(1),
	license: z.string().min(1),
	note: z.string().optional(),
});
export type SourceProvenance = z.infer<typeof SourceProvenance>;

/**
 * Catalog metadata so an operator knows what a target builds before selecting it
 * (eval-targets spec: "Target definition and manifest"). Descriptive only — it
 * is NEVER injected into the rendered base prompt (fairness invariant), it just
 * powers `validate`/listing in the CLI, the Studio target picker, and the
 * generated `docs/TARGETS.md`. `expectedUI` states how much rendered UI a
 * CONFORMANT build will actually have given the (HTTP-light) test plan — it is
 * documentation, not something the harness enforces.
 */
export const CatalogTags = z.object({
	domain: z.string().min(1),
	shape: z.string().min(1),
	expectedUI: z.enum(["none", "served-page", "interactive"]),
});
export type CatalogTags = z.infer<typeof CatalogTags>;

export const TargetManifest = z.object({
	/** One-line catalog summary (what this target builds). */
	summary: z.string().min(1),
	/** Longer catalog description: the deliverable and what is graded. */
	description: z.string().min(1),
	/** Catalog tags: domain, software shape, and expected rendered UI. */
	tags: CatalogTags,
	name: z.string().regex(/^[a-z0-9-]+$/),
	version: z.string(),
	prdFile: z.string(),
	prdSha256: z.string().length(64),
	testplanFile: z.string(),
	conformanceSection: z.string(),
	coverageMode: z.enum(["spec-checklist", "attested"]),
	/** Required when coverageMode is `attested` (eval-targets spec). */
	attestation: z.string().optional(),
	/** Required for targets adapted from a third-party source. */
	source: SourceProvenance.optional(),
	coldStartContract: z.array(z.string()).min(1),
	deliverableNotes: z.string().default(""),
	fixtures: z.array(FixtureDef).default([]),
	/**
	 * Marks a target whose deliverable has a rendered UI, so a `--design` selection
	 * is meaningful (design-adherence). When absent/false, `--design` warns + skips
	 * adherence scoring rather than reporting a misleading zero.
	 */
	ui: z.boolean().optional(),
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

	// Adapted targets must preserve the upstream notice (eval-targets spec:
	// "preserve required upstream notices"). The manifest's required `source`
	// fields are enforced by the schema; here we ensure the NOTICE file exists.
	if (manifest.source && !existsSync(join(targetsDir, "NOTICE"))) {
		throw new TargetError(
			`target '${name}' declares upstream source '${manifest.source.upstream}' but ${join(targetsDir, "NOTICE")} is missing — add the upstream attribution/NOTICE text`,
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

export interface ScaffoldResult {
	dir: string;
	prdSha256: string;
	files: string[];
}

/**
 * Scaffold a new target from a user-provided spec document (eval-targets spec:
 * `init --target <name> --spec <file>`). Writes PRD.md (copied from the spec),
 * a one-step testplan.yaml skeleton bound to the PRD hash, and a target.yaml
 * manifest with placeholders. The result does NOT pass `validate --target`
 * until a human fills the skeleton in — that gate is intentional (an
 * LLM-assisted draft is allowed, but human review is required before a target
 * is run-eligible).
 */
export function scaffoldTarget(
	name: string,
	specPath: string,
	targetsDir = "targets",
): ScaffoldResult {
	if (!/^[a-z0-9-]+$/.test(name)) {
		throw new TargetError(
			`invalid target name '${name}' — use lowercase letters, digits, and hyphens`,
		);
	}
	if (!existsSync(specPath)) {
		throw new TargetError(`spec file not found: ${specPath}`);
	}
	const dir = resolve(targetsDir, name);
	if (existsSync(join(dir, "target.yaml"))) {
		throw new TargetError(
			`target '${name}' already exists at ${dir} — choose another name or edit it directly`,
		);
	}
	mkdirSync(dir, { recursive: true });

	const prdContent = readFileSync(specPath, "utf8");
	const prdSha256 = createHash("sha256").update(prdContent).digest("hex");
	const files: string[] = [];

	const prdPath = join(dir, "PRD.md");
	writeFileSync(prdPath, prdContent);
	files.push(prdPath);

	const testplanPath = join(dir, "testplan.yaml");
	writeFileSync(
		testplanPath,
		`# Frozen test plan for the '${name}' target. SKELETON — author real steps,
# then re-freeze. ViBench semantics: sequential, weighted, fatal gates halt.
# Checks must be observable behavior (commands + expected output/exit/log),
# never code reading. An LLM may draft; a human MUST review (the attestation).
version: "0.1.0"
prdSha256: ${prdSha256}

steps:
  - id: S-1
    covers: ["TODO"]
    description: TODO — replace with a real, observable cold-start gate
    check: TODO — e.g. ./setup.sh exits 0 and the run/start script exists
    weight: 1
    fatal: true
`,
	);
	files.push(testplanPath);

	const manifestPath = join(dir, "target.yaml");
	writeFileSync(
		manifestPath,
		`name: ${name}
summary: TODO — one line on what a conformant build of this target produces
description: >
  TODO — a few sentences on the deliverable and what is graded, so an operator
  knows what to expect before selecting this target.
tags:
  domain: TODO # e.g. scheduling, developer-tooling, logistics
  shape: TODO # e.g. rest-api, cli, daemon-service, web-api-served-page
  expectedUI: none # none | served-page | interactive (what a graded build actually renders)
version: "0.1.0"
prdFile: PRD.md
prdSha256: ${prdSha256}
testplanFile: testplan.yaml
conformanceSection: 'TODO — name the PRD section your prompt will cite'
coverageMode: attested
# attestation is intentionally absent — \`validate --target\` fails until you add
# a dated human coverage sign-off here (which PRD requirements map to which
# steps). This is the human-review gate; an LLM may draft, a human must sign.
# attestation: >
#   Coverage reviewed <date>: <requirement> -> <step ids>, all checks observable.
coldStartContract:
  - "\`setup.sh\` — installs all dependencies for your implementation."
  - "\`run.sh ARGS...\` — TODO: describe how the evaluator invokes the build."
deliverableNotes: >
  TODO — optional guidance the prompt appends (what is in scope / out of scope).
fixtures: []
# Adapted from a third-party spec? Add a 'source:' block (upstream, repo,
# commit, originalDir, license) and ensure ${join(targetsDir, "NOTICE")} exists.
`,
	);
	files.push(manifestPath);

	return { dir, prdSha256, files };
}

/**
 * Render the registry's base-prompt template with this target's slots. When a
 * design is selected (design-adherence), the `{{DESIGN}}` slot becomes a visual
 * contract pointing at the in-workspace `DESIGN.md`; otherwise it renders empty.
 * The rendered text is identical for every candidate (fairness invariant).
 */
export function renderTargetPrompt(
	template: string,
	t: LoadedTarget,
	designName?: string | null,
): string {
	const design = designName
		? `\nFollow the "${designName}" design system, specified in DESIGN.md in this\n` +
			"workspace root. Treat its color tokens, typography scale, spacing, and\n" +
			"radius as the visual contract: realize those exact values in your styles.\n"
		: "";
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
		.replaceAll("{{NOTES}}", t.manifest.deliverableNotes.trim())
		.replaceAll("{{DESIGN}}", design);
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
