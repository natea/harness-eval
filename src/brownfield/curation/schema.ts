/**
 * Curation output and verdict-record schemas (add-task-curation-collective 1.1).
 * Leak items reuse the D9 `LeakItem` shape so any arm's labels read like
 * `leaks.json`; `label` may also be `unlabeled` when the quorum has no gold vote.
 */
import { z } from "zod";
import { LeakItem, LeakLevel } from "../bundle";

export const ARMS = ["single", "controller", "collective"] as const;
export type Arm = (typeof ARMS)[number];

export const ROLES = [
	"issue_reader",
	"gold_comparer",
	"test_auditor",
	"history_agent",
] as const;
export type Role = (typeof ROLES)[number];

export const FairnessVerdict = z.enum(["fair", "unfair", "unsure"]);
export const DifficultyLevel = z.enum(["easy", "medium", "hard"]);

/** One line of `record.jsonl`: a typed verdict posted by a role (D5). */
export const Verdict = z.object({
	agent: z.enum([...ROLES, "controller"]),
	round: z.union([z.literal(1), z.literal(2)]),
	decision: z.enum([
		"localize",
		"leak",
		"fairness",
		"similar_fix",
		"eligibility",
		"objection",
	]),
	item: z.string().optional(),
	value: z.unknown(),
	confidence: z.number().min(0).max(1).optional(),
	evidence: z.string().default(""),
	objects_to: z.string().optional(),
});
export type Verdict = z.infer<typeof Verdict>;

export const CurationItem = LeakItem.extend({
	label: z.union([LeakLevel, z.literal("unlabeled")]),
});

export const CallRecord = z.object({
	agent: z.string(),
	round: z.number().optional(),
	model: z.string(),
	promptHash: z.string(),
	costUsd: z.number(),
	inputManifest: z.array(z.string()),
});
export type CallRecord = z.infer<typeof CallRecord>;

export const CurationOutput = z.object({
	arm: z.enum(ARMS),
	task: z.string(),
	items: z.array(CurationItem),
	fairness: z.object({ verdict: FairnessVerdict, reason: z.string() }),
	/** D10: advisory only; never applied to grading or trial setup. */
	eligibility: z.object({
		excludeTests: z.array(z.string()),
		appEgressNeeded: z.boolean(),
		note: z.string(),
		advisory: z.literal(true),
	}),
	difficulty: DifficultyLevel,
	overBudget: z.boolean(),
	spendUsd: z.number(),
	capUsd: z.number(),
	provenance: z.object({
		ruleHash: z.string().optional(),
		promptHashes: z.record(z.string(), z.string()),
		models: z.array(z.string()),
		calls: z.array(CallRecord),
	}),
});
export type CurationOutput = z.infer<typeof CurationOutput>;
