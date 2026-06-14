import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDesign } from "../src/designs";
import type { SessionScriptResult } from "../src/driver/session";
import { scoreDesignAdherence } from "../src/grading/design-adherence";
import { buildMatrix, runMatrix } from "../src/orchestrator/scheduler";
import { WorktreeProvider } from "../src/providers/worktree";
import { loadRegistry } from "../src/registry";
import { writeScorecard } from "../src/report/markdown";
import { buildResults } from "../src/report/results";
import { renderTargetPrompt } from "../src/targets";
import { RunConfig, type SessionRecord, type TrialResult } from "../src/types";

const base = mkdtempSync(join(tmpdir(), "he-design-e2e-"));
const runDir = join(base, "run-design-001");
mkdirSync(join(runDir, "trials"), { recursive: true });

afterAll(() => rmSync(base, { recursive: true, force: true }));

/**
 * 4.2 design-adherence dry run: a candidate "builds" a UI from the `linear`
 * DESIGN.md (fake executor, no spend), then the static scorer grades realized
 * tokens and the grade surfaces in results + scorecard. Mirrors e2e-dry but for
 * the design dimension: DESIGN.md placement → prompt slot → score → scorecard.
 */
describe("design-adherence e2e dry run (4.2)", () => {
	test("web-app + --design linear → adherence score in scorecard", async () => {
		const registry = loadRegistry("config/registry.yaml");
		const design = loadDesign("linear");

		// The base prompt carries the visual contract when a design is selected.
		const fakeTarget = {
			manifest: {
				prdFile: "PRD.md",
				conformanceSection: "section 7",
				coldStartContract: ["`setup.sh`"],
				deliverableNotes: "",
				ui: true,
			},
		} as never;
		const prompt = renderTargetPrompt(registry.basePrompt, fakeTarget, "linear");
		expect(prompt).toContain('Follow the "linear" design system');
		expect(prompt).not.toContain("{{DESIGN}}");

		const config = RunConfig.parse({
			candidates: ["superpowers"],
			trialsPerCandidate: 1,
			provider: "worktree",
			concurrency: 1,
		});
		const candidate = registry.candidates.find((c) => c.id === "superpowers");
		if (!candidate) throw new Error("missing candidate");
		const dryCandidate = {
			...candidate,
			harnesses: {
				"claude-code": {
					...candidate.harnesses["claude-code"]!,
					install: ["true"],
				},
			},
		};
		const dryRegistry = { ...registry, candidates: [dryCandidate] };

		// Faithful "build": realize linear's own palette + display font in CSS.
		const palette = Object.values(design.spec.colors).join(";");
		const fakeExecutor = async (sandbox: {
			writeFile: (p: string, c: string) => Promise<void>;
		}): Promise<SessionScriptResult> => {
			await sandbox.writeFile(
				"app.css",
				`:root{${palette}}\nbody{font-family:"Linear Display",sans-serif}`,
			);
			await sandbox.writeFile("setup.sh", "#!/bin/sh\nexit 0\n");
			const record: SessionRecord = {
				sessionId: "dry-design-1",
				stepIndex: 0,
				durationMs: 60000,
				numTurns: 4,
				costUsd: 0.2,
				usage: {
					inputTokens: 2000,
					outputTokens: 800,
					cacheReadTokens: 0,
					cacheCreationTokens: 0,
				},
				isError: false,
			};
			return {
				records: [record],
				transcripts: ["{}"],
				status: "completed",
				cappedBy: null,
				notes: [],
			};
		};

		const provider = new WorktreeProvider(join(base, "sandboxes"));
		const plans = buildMatrix([dryCandidate], 1);
		const trials = await runMatrix(config, plans, {
			provider,
			registry: dryRegistry,
			runDir,
			prdContent: "# Tiny PRD\nBuild a UI.\n",
			prdSha256: "dry-prd-hash",
			testPlanSha256: "dry-plan-hash",
			designContent: design.content,
			harnessVersion: "2.1.170",
			executeScript: fakeExecutor as never,
		});

		const trial = trials[0] as TrialResult;
		const workspace = join(runDir, "trials", trial.provenance.trialId, "workspace");

		// DESIGN.md was placed in the workspace alongside SPEC.md.
		expect(readFileSync(join(workspace, "DESIGN.md"), "utf8")).toBe(
			design.content,
		);

		// Score the realized tokens and attach as a grade.
		const da = scoreDesignAdherence(workspace, design.spec, design.fontAliases);
		expect(da.color.score).toBeGreaterThan(90); // built from linear's palette
		trial.grades = {
			trialId: trial.provenance.trialId,
			adherence: null,
			quality: null,
			integration: null,
			designAdherence: {
				design: design.name,
				designSha256: design.sha256,
				provenance: {
					upstream: design.source.upstream,
					commit: design.source.commit,
					license: design.source.license,
				},
				score: da.score,
				colorScore: da.color.score,
				typographyScore: da.typography.score,
				colorsMatched: da.color.matches.filter((m) => m.matched).length,
				colorsTotal: da.color.matches.length,
				typographyMatched: da.typography.matches.filter((m) => m.matched).length,
				typographyTotal: da.typography.matches.length,
				filesScanned: da.realized.filesScanned,
				note: da.note,
			},
		};

		const results = buildResults({
			runId: "run-design-001",
			config,
			prdSha256: "dry-prd-hash",
			testPlanSha256: "dry-plan-hash",
			startedAt: trial.provenance.startedAt,
			endedAt: trial.provenance.endedAt,
			trials,
		});
		const scorecard = readFileSync(writeScorecard(runDir, results), "utf8");
		expect(scorecard).toContain("design adherence (`linear`)");
		expect(scorecard).toContain(`color ${da.color.score}`);
	}, 30000);
});
