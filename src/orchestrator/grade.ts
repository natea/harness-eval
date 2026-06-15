import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LoadedDesign } from "../designs";
import { judgeQualityCC, runEvaluatorCC } from "../grading/cc-driver";
import { scoreDesignAdherence } from "../grading/design-adherence";
import { runEvaluator } from "../grading/evaluator";
import { judgeQuality } from "../grading/judge";
import { scrubWorkspace } from "../grading/scrub";
import type { LoadedTarget } from "../targets";
import { startFixtures, stopFixtures } from "../targets";
import type { Registry, TrialGrades, TrialResult } from "../types";

export interface GradeOptions {
	target: LoadedTarget;
	/** Selected design (design-adherence), or null. */
	design: LoadedDesign | null;
	registry: Registry;
	/** Judge model id (≠ worker model). */
	judgeModel: string;
	runDir: string;
	/** First fixture port; each trial increments it. */
	basePort?: number;
	log?: (msg: string) => void;
	/** Cooperative cancellation: checked between trials so Cancel can interrupt. */
	signal?: AbortSignal;
	/** Coarse grading progress for live UI (e.g. "evaluating superpowers-t1 (1/2)").
	 *  Lets the studio show grading distinctly from the build's archive phase. */
	onStage?: (stage: string) => void;
	/** Grading transport. `cc` (default) runs evaluator+judge on the Claude Code
	 *  subscription (CLAUDE_CODE_OAUTH_TOKEN); `sdk` calls the Anthropic API
	 *  directly (billed to the API account). Default cc so a $0 API balance never
	 *  blocks grading a run the subscription already built. */
	driver?: "cc" | "sdk";
}

/**
 * Grade each trial in place (eval-orchestration): PRD adherence via the test-plan
 * evaluator, blind code-quality judging on the scrubbed copy, and — when a UI
 * design was selected — static design adherence. Writes `grades.json` per trial
 * and mutates `trial.grades`. Shared by the CLI run path and the studio live
 * launcher so both grade identically.
 */
export async function gradeTrials(
	trials: TrialResult[],
	opts: GradeOptions,
): Promise<void> {
	const { target, design, registry, judgeModel, runDir } = opts;
	const log = opts.log ?? (() => {});
	let mockPort = opts.basePort ?? 4280;

	const total = trials.length;
	for (const [idx, trial] of trials.entries()) {
		if (opts.signal?.aborted) {
			log("grading aborted before next trial");
			break;
		}
		const trialId = trial.provenance.trialId;
		const trialDir = join(runDir, "trials", trialId);
		const workspace = join(trialDir, "workspace");
		if (!existsSync(workspace)) continue;
		log(`grading ${trialId}…`);
		opts.onStage?.(`evaluating ${trialId} (${idx + 1}/${total})`);
		mockPort++;
		const fixtures = startFixtures(target, mockPort);
		await new Promise((r) => setTimeout(r, 500));
		writeFileSync(join(workspace, "SPEC-REFERENCE.md"), target.prdContent);
		const driver = opts.driver ?? "cc";
		const mockLinearUrl =
			fixtures.find((f) => f.name === "mock-linear")?.value ??
			`http://localhost:${mockPort}`;
		const stubAppServerPath =
			fixtures.find((f) => f.name === "stub-app-server")?.value ?? "";
		let adherence: Awaited<ReturnType<typeof runEvaluator>>;
		let quality: Awaited<ReturnType<typeof judgeQuality>>;
		try {
			adherence =
				driver === "sdk"
					? await runEvaluator(target.plan, {
							model: judgeModel,
							workspaceDir: workspace,
							mockLinearUrl,
							stubAppServerPath,
						})
					: await runEvaluatorCC(target.plan, {
							model: judgeModel,
							workspaceDir: workspace,
							trialDir,
							mockLinearUrl,
							stubAppServerPath,
						});
			const blindDir = join(trialDir, "workspace-blind");
			scrubWorkspace(workspace, blindDir, registry.candidates);
			opts.onStage?.(`scoring ${trialId} (${idx + 1}/${total})`);
			quality =
				driver === "sdk"
					? await judgeQuality({
							model: judgeModel,
							blindWorkspaceDir: blindDir,
						})
					: await judgeQualityCC({
							model: judgeModel,
							blindWorkspaceDir: blindDir,
						});
		} finally {
			stopFixtures(fixtures);
		}

		// Design adherence (static, no browser) when a UI design was selected.
		let designAdherence: TrialGrades["designAdherence"] = null;
		if (design && target.manifest.ui) {
			const da = scoreDesignAdherence(
				workspace,
				design.spec,
				design.fontAliases,
			);
			designAdherence = {
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
				typographyMatched: da.typography.matches.filter((m) => m.matched)
					.length,
				typographyTotal: da.typography.matches.length,
				filesScanned: da.realized.filesScanned,
				note: da.note,
			};
			log(
				`  design adherence (${design.name}): ${da.score} [color ${da.color.score}, type ${da.typography.score}]`,
			);
		}

		trial.grades = {
			trialId: trial.provenance.trialId,
			adherence,
			quality,
			integration: null,
			designAdherence,
		};
		writeFileSync(
			join(trialDir, "grades.json"),
			JSON.stringify(trial.grades, null, 2),
		);
	}
}
