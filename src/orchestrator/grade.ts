import {
	cpSync,
	existsSync,
	readFileSync,
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
import type { ModelProfile } from "../models";
import type { LoadedTarget } from "../targets";
import { startFixtures, stopFixtures } from "../targets";
import type { Registry, TrialGrades, TrialResult } from "../types";

export type GradingDriver = "cc" | "sdk";

export interface GradeDeps {
	startFixtures: typeof startFixtures;
	stopFixtures: typeof stopFixtures;
	runEvaluatorCC: typeof runEvaluatorCC;
	runEvaluator: typeof runEvaluator;
	judgeQualityCC: typeof judgeQualityCC;
	judgeQuality: typeof judgeQuality;
	scrubWorkspace: typeof scrubWorkspace;
}

const defaultGradeDeps: GradeDeps = {
	startFixtures,
	stopFixtures,
	runEvaluatorCC,
	runEvaluator,
	judgeQualityCC,
	judgeQuality,
	scrubWorkspace,
};

export function gradeDriversForJudge(
	requested: GradingDriver,
	judgeProfile?: ModelProfile,
): { evaluator: GradingDriver; quality: GradingDriver } {
	if (judgeProfile?.transport === "openai-compat") {
		return { evaluator: "cc", quality: "sdk" };
	}
	return { evaluator: requested, quality: requested };
}

export interface GradeOptions {
	target: LoadedTarget;
	/** Selected design (design-adherence), or null. */
	design: LoadedDesign | null;
	registry: Registry;
	/** Judge model id (≠ worker model). */
	judgeModel: string;
	/** Optional PRD evaluator model; defaults to judgeModel except local quality judges. */
	evaluatorModel?: string;
	/** Resolved judge profile when available; used for transport-aware judging. */
	judgeProfile?: ModelProfile;
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
	driver?: GradingDriver;
	/** Per-trial grading budget. A trial that exceeds it is left ungraded (with a
	 *  note) and grading continues — one slow trial never fails the whole run.
	 *  Default 60 min/trial. */
	trialTimeoutMs?: number;
	/** Test seam for deterministic partial-grading coverage. */
	deps?: Partial<GradeDeps>;
}

/** Reject if `p` does not settle within `ms`. */
function withTimeout<T>(
	p: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
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
	const deps = { ...defaultGradeDeps, ...opts.deps };
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
		const fixtures = deps.startFixtures(target, mockPort);
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
		const drivers = gradeDriversForJudge(driver, opts.judgeProfile);
		const qualityModelFlag = opts.judgeProfile?.modelId ?? judgeModel;
		const evaluatorModelFlag =
			opts.evaluatorModel ??
			(opts.judgeProfile?.transport === "openai-compat"
				? "claude-sonnet-4-6"
				: qualityModelFlag);
		const mockLinearUrl =
			fixtures.find((f) => f.name === "mock-linear")?.value ??
			`http://localhost:${mockPort}`;
		const stubAppServerPath =
			fixtures.find((f) => f.name === "stub-app-server")?.value ?? "";
		const trialBudgetMs = opts.trialTimeoutMs ?? 60 * 60_000;
		let adherence: Awaited<ReturnType<typeof runEvaluator>> | null = null;
		let quality: Awaited<ReturnType<typeof judgeQuality>> | null = null;

		try {
			try {
				adherence = await withTimeout(
					drivers.evaluator === "sdk"
						? deps.runEvaluator(target.plan, {
								model: evaluatorModelFlag,
								workspaceDir: evalWorkspace,
								mockLinearUrl,
								stubAppServerPath,
							})
						: deps.runEvaluatorCC(target.plan, {
								model: evaluatorModelFlag,
								workspaceDir: evalWorkspace,
								trialDir,
								mockLinearUrl,
								stubAppServerPath,
							}),
					trialBudgetMs,
					`adherence grading ${trialId} exceeded ${Math.round(trialBudgetMs / 60_000)}m`,
				);
			} catch (e) {
				const note = `adherence grading incomplete: ${String(e).slice(0, 140)}`;
				log(`  ${trialId}: ${note}`);
				trial.provenance.notes.push(note);
			}

			const blindDir = join(trialDir, "workspace-blind");
			deps.scrubWorkspace(workspace, blindDir, registry.candidates);
			opts.onStage?.(`scoring ${trialId} (${idx + 1}/${total})`);
			const judgeCheckpointPath = join(trialDir, "judge-checkpoint.json");
			const judgeCheckpoint: Awaited<ReturnType<typeof judgeQuality>>["criteria"] =
				existsSync(judgeCheckpointPath)
					? JSON.parse(readFileSync(judgeCheckpointPath, "utf8"))
					: [];
			const onCriterion = (
				c: Awaited<ReturnType<typeof judgeQuality>>["criteria"][number],
			) => {
				judgeCheckpoint.push(c);
				writeFileSync(
					judgeCheckpointPath,
					JSON.stringify(judgeCheckpoint, null, 2),
				);
				log(
					`  ${trialId}: criterion ${c.criterion}: ${c.score} (samples ${c.samples.join(",")})`,
				);
			};
			try {
				quality = await withTimeout(
					drivers.quality === "sdk"
						? deps.judgeQuality({
								model: qualityModelFlag,
								blindWorkspaceDir: blindDir,
								judgeProfile: opts.judgeProfile,
								preScored: judgeCheckpoint,
								onCriterion,
							})
						: deps.judgeQualityCC({
								model: qualityModelFlag,
								blindWorkspaceDir: blindDir,
								preScored: judgeCheckpoint,
								onCriterion,
							}),
					trialBudgetMs,
					`quality grading ${trialId} exceeded ${Math.round(trialBudgetMs / 60_000)}m`,
				);
			} catch (e) {
				const note = `quality grading incomplete: ${String(e).slice(0, 140)}`;
				log(`  ${trialId}: ${note}`);
				trial.provenance.notes.push(note);
			}
		} finally {
			deps.stopFixtures(fixtures);
			cleanupIsolated();
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

		if (!adherence && !quality && !designAdherence) continue;

		trial.grades = {
			trialId: trial.provenance.trialId,
			adherence,
			quality,
			integration: null,
			grading: {
				evaluatorDriver: drivers.evaluator,
				qualityDriver: drivers.quality,
				judgeTransport: opts.judgeProfile?.transport,
				evaluatorModel: evaluatorModelFlag,
				qualityModel: qualityModelFlag,
			},
			designAdherence,
		};
		writeFileSync(
			join(trialDir, "grades.json"),
			JSON.stringify(trial.grades, null, 2),
		);
	}
}
