import {
	cpSync,
	existsSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
	/** Per-trial grading budget. A trial that exceeds it is left ungraded (with a
	 *  note) and grading continues — one slow trial never fails the whole run.
	 *  Default 60 min/trial. */
	trialTimeoutMs?: number;
}

/** Reject if `p` does not settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), ms);
	});
	return Promise.race([p, timeout]).finally(() =>
		clearTimeout(timer),
	) as Promise<T>;
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
		// Run the app-under-test from a copy OUTSIDE the repo tree. The evaluator
		// boots the built app (`node server.js`), and Node resolves `package.json`
		// by climbing ancestor dirs — a workspace under `runs/` hits the harness
		// repo's own `package.json` ("type":"module"), which makes Node treat a
		// no-package.json CommonJS app as ESM and crash it at boot (a false-negative
		// that fatal-fails the whole test plan). A tmp copy (os.tmpdir() is never
		// under the repo) breaks that ancestor chain, so the app's own package.json —
		// or its absence (→ CommonJS default) — governs. Quality/design judging read
		// files only (no app boot), so they keep using the archived workspace.
		const isolatedRoot = mkdtempSync(join(tmpdir(), `he-grade-${trialId}-`));
		const evalWorkspace = join(isolatedRoot, "workspace");
		cpSync(workspace, evalWorkspace, { recursive: true });
		const cleanupIsolated = () =>
			rmSync(isolatedRoot, { recursive: true, force: true });
		const driver = opts.driver ?? "cc";
		const mockLinearUrl =
			fixtures.find((f) => f.name === "mock-linear")?.value ??
			`http://localhost:${mockPort}`;
		const stubAppServerPath =
			fixtures.find((f) => f.name === "stub-app-server")?.value ?? "";
		const trialBudgetMs = opts.trialTimeoutMs ?? 60 * 60_000;
		let graded: {
			adherence: Awaited<ReturnType<typeof runEvaluator>>;
			quality: Awaited<ReturnType<typeof judgeQuality>>;
		};
		try {
			graded = await withTimeout(
				(async () => {
					const adherence =
						driver === "sdk"
							? await runEvaluator(target.plan, {
									model: judgeModel,
									workspaceDir: evalWorkspace,
									mockLinearUrl,
									stubAppServerPath,
								})
							: await runEvaluatorCC(target.plan, {
									model: judgeModel,
									workspaceDir: evalWorkspace,
									trialDir,
									mockLinearUrl,
									stubAppServerPath,
								});
					const blindDir = join(trialDir, "workspace-blind");
					scrubWorkspace(workspace, blindDir, registry.candidates);
					opts.onStage?.(`scoring ${trialId} (${idx + 1}/${total})`);
					const quality =
						driver === "sdk"
							? await judgeQuality({
									model: judgeModel,
									blindWorkspaceDir: blindDir,
								})
							: await judgeQualityCC({
									model: judgeModel,
									blindWorkspaceDir: blindDir,
								});
					return { adherence, quality };
				})(),
				trialBudgetMs,
				`grading ${trialId} exceeded ${Math.round(trialBudgetMs / 60_000)}m`,
			);
		} catch (e) {
			// One trial's grading timing out or failing must NOT fail the whole run:
			// leave it ungraded (a later scripts/grade-trial.ts re-grade fills it in)
			// and continue, so the run still finalizes with the grades that completed.
			stopFixtures(fixtures);
			cleanupIsolated();
			const note = `grading incomplete: ${String(e).slice(0, 140)}`;
			log(`  ${trialId}: ${note}`);
			trial.provenance.notes.push(note);
			continue;
		}
		stopFixtures(fixtures);
		cleanupIsolated();
		const { adherence, quality } = graded;

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
