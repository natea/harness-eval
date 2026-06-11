import { z } from "zod";

// ---------------------------------------------------------------------------
// Identifiers and enums
// ---------------------------------------------------------------------------

export const HarnessId = z.enum(["claude-code", "opencode", "codex"]);
export type HarnessId = z.infer<typeof HarnessId>;

export const IsolationProviderId = z.enum(["daytona", "e2b", "docker", "macos-vz", "worktree"]);
export type IsolationProviderId = z.infer<typeof IsolationProviderId>;

export const TrialStatus = z.enum([
	"pending",
	"running",
	"completed",
	"capped",
	"infra-failed",
	"skipped:budget",
]);
export type TrialStatus = z.infer<typeof TrialStatus>;

export const Dimension = z.enum([
	"prdAdherence",
	"codeQuality",
	"speed",
	"tokenSpend",
]);
export type Dimension = z.infer<typeof Dimension>;

// ---------------------------------------------------------------------------
// Candidate registry
// ---------------------------------------------------------------------------

/** One step of a scripted harness session. */
export const SessionStep = z.object({
	/** Prompt or slash command sent to the harness. `{{BASE_PROMPT}}` is substituted. */
	prompt: z.string().min(1),
	/** Start a new session instead of resuming the previous one. */
	newSession: z.boolean().default(false),
});
export type SessionStep = z.infer<typeof SessionStep>;

export const ContinuationPolicy = z.object({
	/** Generic continuation texts allowed when the framework pauses at a gate. */
	allowlist: z
		.array(z.string().min(1))
		.default(["proceed", "continue with the plan"]),
	/** Max continuations issued per session before the trial is considered stalled. */
	maxContinuations: z.int().nonnegative().default(10),
});
export type ContinuationPolicy = z.infer<typeof ContinuationPolicy>;

export const HarnessSetup = z.object({
	/** Shell commands run in the sandbox to install the framework for this harness. */
	install: z.array(z.string().min(1)),
	/** Ordered session steps; rendered with the shared base prompt. */
	session: z.array(SessionStep).min(1),
	continuation: ContinuationPolicy.default(ContinuationPolicy.parse({})),
});
export type HarnessSetup = z.infer<typeof HarnessSetup>;

export const CandidateEntry = z.object({
	id: z.string().regex(/^[a-z0-9-]+$/),
	name: z.string().min(1),
	repo: z.url(),
	/** Exact released version, npm version, or git commit SHA. Never "latest". */
	pinnedVersion: z
		.string()
		.min(1)
		.refine((v) => v !== "latest", {
			message: "pinnedVersion must not be 'latest'",
		}),
	/** Paths the framework creates that identify it; scrubbed before blind judging. */
	markerPaths: z.array(z.string().min(1)).default([]),
	harnesses: z.partialRecord(HarnessId, HarnessSetup),
});
export type CandidateEntry = z.infer<typeof CandidateEntry>;

export const Registry = z.object({
	/** Shared base task prompt template; identical for every candidate. */
	basePrompt: z.string().min(1),
	candidates: z.array(CandidateEntry).min(1),
});
export type Registry = z.infer<typeof Registry>;

// ---------------------------------------------------------------------------
// Run configuration
// ---------------------------------------------------------------------------

export const Weights = z
	.object({
		prdAdherence: z.number().nonnegative().default(0.4),
		codeQuality: z.number().nonnegative().default(0.25),
		speed: z.number().nonnegative().default(0.175),
		tokenSpend: z.number().nonnegative().default(0.175),
	})
	.refine(
		(w) =>
			Math.abs(w.prdAdherence + w.codeQuality + w.speed + w.tokenSpend - 1) <
			1e-9,
		{
			message: "weights must sum to 1",
		},
	);
export type Weights = z.infer<typeof Weights>;

export const Budget = z.object({
	trialWallClockMs: z
		.int()
		.positive()
		.default(2 * 60 * 60 * 1000),
	trialCostUsd: z.number().positive().default(50),
	runCostUsd: z.number().positive().default(400),
});
export type Budget = z.infer<typeof Budget>;

export const RunConfig = z.object({
	candidates: z.array(z.string()).min(1),
	harness: HarnessId.default("claude-code"),
	model: z.string().default("claude-opus-4-6"),
	trialsPerCandidate: z.int().positive().default(3),
	provider: IsolationProviderId.default("daytona"),
	concurrency: z.int().positive().default(2),
	budget: Budget.default(Budget.parse({})),
	weights: Weights.default(Weights.parse({})),
	judgeModel: z.string().default("claude-sonnet-4-6"),
	infraRetryLimit: z.int().nonnegative().default(2),
	realIntegrationTier: z.boolean().default(false),
});
export type RunConfig = z.infer<typeof RunConfig>;

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export const TokenUsage = z.object({
	inputTokens: z.int().nonnegative(),
	outputTokens: z.int().nonnegative(),
	cacheReadTokens: z.int().nonnegative().default(0),
	cacheCreationTokens: z.int().nonnegative().default(0),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

export const SessionRecord = z.object({
	sessionId: z.string(),
	stepIndex: z.int().nonnegative(),
	durationMs: z.int().nonnegative(),
	numTurns: z.int().nonnegative(),
	costUsd: z.number().nonnegative(),
	usage: TokenUsage,
	isError: z.boolean().default(false),
});
export type SessionRecord = z.infer<typeof SessionRecord>;

export const TrialTelemetry = z.object({
	sessions: z.array(SessionRecord),
	/** Agent working time only; setup/install/grading excluded per spec. */
	agentDurationMs: z.int().nonnegative(),
	setupDurationMs: z.int().nonnegative(),
	totalCostUsd: z.number().nonnegative(),
	totalTokens: TokenUsage,
	totalTurns: z.int().nonnegative(),
});
export type TrialTelemetry = z.infer<typeof TrialTelemetry>;

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export const TrialProvenance = z.object({
	runId: z.string(),
	trialId: z.string(),
	candidate: z.string(),
	candidateVersion: z.string(),
	harness: HarnessId,
	harnessVersion: z.string(),
	model: z.string(),
	provider: IsolationProviderId,
	snapshotId: z.string().nullable(),
	prdSha256: z.string(),
	testPlanSha256: z.string().nullable(),
	sessionScript: z.array(SessionStep),
	startedAt: z.iso.datetime(),
	endedAt: z.iso.datetime().nullable(),
	status: TrialStatus,
	cappedBy: z.enum(["wall-clock", "cost"]).nullable().default(null),
	notes: z.array(z.string()).default([]),
});
export type TrialProvenance = z.infer<typeof TrialProvenance>;

// ---------------------------------------------------------------------------
// Test plan (PRD adherence)
// ---------------------------------------------------------------------------

export const TestPlanStep = z.object({
	id: z.string().regex(/^[A-Z0-9.-]+$/i),
	/** Spec sections this step covers, e.g. "18.1", "8.4". */
	covers: z.array(z.string()).min(1),
	description: z.string().min(1),
	/** Concrete observable check the evaluator must perform. */
	check: z.string().min(1),
	weight: z.number().positive().default(1),
	/** Bonus steps (OPTIONAL/RECOMMENDED spec items) never count toward the Graded Score. */
	bonus: z.boolean().default(false),
	/**
	 * Fatal steps halt test-plan execution on failure (ViBench §3.1 semantics);
	 * remaining steps score 0. Non-fatal failures allow execution to continue
	 * for granular partial credit.
	 */
	fatal: z.boolean().default(false),
});
export type TestPlanStep = z.infer<typeof TestPlanStep>;

export const TestPlan = z.object({
	version: z.string(),
	prdSha256: z.string(),
	steps: z.array(TestPlanStep).min(1),
});
export type TestPlan = z.infer<typeof TestPlan>;

export const StepOutcome = z.enum(["pass", "partial", "fail"]);
export type StepOutcome = z.infer<typeof StepOutcome>;

export const StepResult = z.object({
	stepId: z.string(),
	outcome: StepOutcome,
	/** Partial credit in [0,1]; pass=1, fail=0, partial in between. */
	credit: z.number().min(0).max(1),
	evidence: z.string().min(1),
});
export type StepResult = z.infer<typeof StepResult>;

// ---------------------------------------------------------------------------
// Grading records
// ---------------------------------------------------------------------------

export const AdherenceResult = z.object({
	gradedScore: z.number().min(0).max(100),
	passAt1: z.boolean(),
	completeFailure: z.boolean(),
	stepResults: z.array(StepResult),
});
export type AdherenceResult = z.infer<typeof AdherenceResult>;

export const QualityCriterion = z.enum([
	"tests",
	"architecture",
	"errorHandling",
	"deadCode",
	"documentation",
]);
export type QualityCriterion = z.infer<typeof QualityCriterion>;

export const CriterionScore = z.object({
	criterion: QualityCriterion,
	/** All judge samples (median taken); each 0-10. */
	samples: z.array(z.number().min(0).max(10)).min(1),
	score: z.number().min(0).max(10),
	justification: z.string(),
});
export type CriterionScore = z.infer<typeof CriterionScore>;

export const QualityResult = z.object({
	judgeModel: z.string(),
	criteria: z.array(CriterionScore),
	/** Mean of criterion medians scaled to 0-100. */
	score: z.number().min(0).max(100),
});
export type QualityResult = z.infer<typeof QualityResult>;

export const IntegrationFixtureOutcome = z.object({
	fixtureId: z.string(),
	polled: z.boolean(),
	dispatched: z.boolean(),
	workspaceCreated: z.boolean(),
	agentRunCompleted: z.boolean(),
	handoffReached: z.boolean(),
	evidence: z.string(),
});
export type IntegrationFixtureOutcome = z.infer<
	typeof IntegrationFixtureOutcome
>;

export const IntegrationResult = z.object({
	ran: z.boolean(),
	skippedReason: z.string().nullable().default(null),
	manifestSha256: z.string().nullable().default(null),
	fixtures: z.array(IntegrationFixtureOutcome).default([]),
});
export type IntegrationResult = z.infer<typeof IntegrationResult>;

export const TrialGrades = z.object({
	trialId: z.string(),
	adherence: AdherenceResult.nullable(),
	quality: QualityResult.nullable(),
	integration: IntegrationResult.nullable(),
});
export type TrialGrades = z.infer<typeof TrialGrades>;

// ---------------------------------------------------------------------------
// Results / report JSON
// ---------------------------------------------------------------------------

export const TrialResult = z.object({
	provenance: TrialProvenance,
	telemetry: TrialTelemetry.nullable(),
	grades: TrialGrades.nullable(),
});
export type TrialResult = z.infer<typeof TrialResult>;

export const DimensionStats = z.object({
	mean: z.number(),
	min: z.number(),
	max: z.number(),
	stddev: z.number(),
});
export type DimensionStats = z.infer<typeof DimensionStats>;

export const CandidateScore = z.object({
	candidate: z.string(),
	harness: HarnessId,
	model: z.string(),
	/** Normalized 0-100 per dimension (means across trials). */
	dimensions: z.record(Dimension, z.number()),
	stats: z.record(Dimension, DimensionStats),
	composite: z.number(),
	compositeStats: DimensionStats,
	trialsCounted: z.int().nonnegative(),
	rightCensored: z.boolean().default(false),
});
export type CandidateScore = z.infer<typeof CandidateScore>;

export const RunResults = z.object({
	schemaVersion: z.literal(1),
	runId: z.string(),
	config: RunConfig,
	weights: Weights,
	prdSha256: z.string(),
	testPlanSha256: z.string().nullable(),
	startedAt: z.iso.datetime(),
	endedAt: z.iso.datetime().nullable(),
	scores: z.array(CandidateScore),
	trials: z.array(TrialResult),
	exclusions: z.array(
		z.object({ trialId: z.string(), status: TrialStatus, reason: z.string() }),
	),
	inconclusive: z.boolean(),
});
export type RunResults = z.infer<typeof RunResults>;
