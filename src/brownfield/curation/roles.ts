/**
 * Role agents (add-task-curation-collective 2.2, D3–D5). Each role sees only its
 * declared evidence; the input manifest of every call is recorded.
 */
import { LEAK_LEVELS, type LeakLevel } from "../bundle";
import { LEAK_SCHEMA, LEAK_SYSTEM_PROMPT, buildPrompt } from "../classify";
import {
	renderFileList,
	renderHistory,
	renderReference,
	renderTests,
	renderThread,
	type TaskCtx,
	threadItems,
} from "./evidence";
import { type Budget, callAgent, loadPrompt, pool } from "./invoke";
import { localizes } from "./quorum";
import type { Verdict } from "./schema";

const FAIR = ["fair", "unfair", "unsure"] as const;
type Fair = (typeof FAIR)[number];

// ---------- issue reader ----------

const LOCALIZE_SCHEMA = {
	type: "object",
	properties: {
		files: { type: "array", items: { type: "string" }, maxItems: 5 },
		rationale: { type: "string" },
	},
	required: ["files", "rationale"],
} as const;

export interface IssueReaderOut {
	/** Per prefix k (0 = body): predicted files and whether it localized. */
	prefixes: { id: string; files: string[]; localizes: boolean }[];
	/** Localization rate per prompt variant (by-product, D4). */
	variants: Record<"body" | "body+human" | "body+all", boolean>;
}

export async function issueReader(ctx: TaskCtx, budget: Budget): Promise<IssueReaderOut> {
	const p = loadPrompt("issue-reader");
	const items = threadItems(ctx);
	const human = items.filter((it, i) => i === 0 || !it.isBot);
	const runs: { id: string; items: typeof items; vote: boolean }[] = [
		...items.map((it, k) => ({ id: it.id, items: items.slice(0, k + 1), vote: true })),
	];
	// body+human: an extra run with no item vote (only when it differs from a prefix).
	const humanIsPrefix = human.every((x, i) => x === items[i]);
	if (!humanIsPrefix) runs.push({ id: "body+human", items: human, vote: false });
	const outs = await pool(runs, 6, (r) =>
		callAgent<{ files: string[] }>(
			{
				agent: "issue_reader",
				round: 1,
				system: p.text,
				prompt: `${renderThread(ctx, r.items, false)}\n${renderFileList(ctx)}`,
				schema: LOCALIZE_SCHEMA,
				inputManifest: [`issue@T*:${r.items.map((x) => x.id).join("+")}`, "file-list@base"],
			},
			budget,
		),
	);
	const prefixes = runs
		.map((r, i) => ({ r, o: outs[i] as { files: string[] } }))
		.filter(({ r }) => r.vote)
		.map(({ r, o }) => ({ id: r.id, files: o.files, localizes: localizes(o.files, ctx.refFiles) }));
	const humanRun = runs.findIndex((r) => r.id === "body+human");
	return {
		prefixes,
		variants: {
			body: prefixes[0]?.localizes ?? false,
			"body+all": prefixes.at(-1)?.localizes ?? false,
			"body+human":
				humanRun >= 0
					? localizes((outs[humanRun] as { files: string[] }).files, ctx.refFiles)
					: (prefixes[human.length - 1]?.localizes ?? false),
		},
	};
}

// ---------- gold comparer ----------

const GOLD_SCHEMA = {
	type: "object",
	properties: {
		items: LEAK_SCHEMA.properties.items,
		fairness: { type: "string", enum: [...FAIR] },
		fairness_reason: { type: "string" },
	},
	required: ["items", "fairness", "fairness_reason"],
} as const;

export interface GoldItem {
	id: string;
	label: LeakLevel;
	consistent_with_reference: boolean;
	reveals_files: string[];
	evidence: string;
	rationale: string;
}
export interface GoldOut {
	items: GoldItem[];
	fairness: Fair;
	fairness_reason: string;
}

export function goldEvidence(ctx: TaskCtx): string {
	return buildPrompt({ snapshot: ctx.snapshot, referencePatch: ctx.reference, prAuthor: ctx.prAuthor }).prompt;
}

export async function goldComparer(ctx: TaskCtx, budget: Budget): Promise<GoldOut> {
	const add = loadPrompt("gold-comparer");
	return callAgent<GoldOut>(
		{
			agent: "gold_comparer",
			round: 1,
			system: LEAK_SYSTEM_PROMPT + add.text,
			prompt: goldEvidence(ctx),
			schema: GOLD_SCHEMA,
			inputManifest: ["issue@T*", "reference.patch"],
		},
		budget,
	);
}

// ---------- test auditor ----------

const AUDIT_SCHEMA = {
	type: "object",
	properties: {
		fairness: { type: "string", enum: [...FAIR] },
		fairness_reason: { type: "string" },
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					label: { type: "string", enum: [...LEAK_LEVELS] },
					evidence: { type: "string" },
				},
				required: ["id", "label", "evidence"],
			},
		},
		exclude_tests: { type: "array", items: { type: "string" } },
		needs_live_api: { type: "boolean" },
		eligibility_note: { type: "string" },
	},
	required: ["fairness", "fairness_reason", "items", "exclude_tests", "needs_live_api", "eligibility_note"],
} as const;

export interface AuditOut {
	fairness: Fair;
	fairness_reason: string;
	items: { id: string; label: LeakLevel; evidence: string }[];
	exclude_tests: string[];
	needs_live_api: boolean;
	eligibility_note: string;
}

export function auditEvidence(ctx: TaskCtx): string {
	return `${renderThread(ctx, threadItems(ctx), false)}\n${renderTests(ctx)}`;
}

export async function testAuditor(ctx: TaskCtx, budget: Budget): Promise<AuditOut> {
	const p = loadPrompt("test-auditor");
	return callAgent<AuditOut>(
		{
			agent: "test_auditor",
			round: 1,
			system: p.text,
			prompt: auditEvidence(ctx),
			schema: AUDIT_SCHEMA,
			inputManifest: ["issue@T*", "tests.patch", "validation"],
		},
		budget,
	);
}

// ---------- history agent ----------

const HISTORY_SCHEMA = {
	type: "object",
	properties: {
		similar_prior_fix: { type: "boolean" },
		similar_commit: { type: "string" },
		conventions: { type: "string" },
	},
	required: ["similar_prior_fix", "similar_commit", "conventions"],
} as const;

export interface HistoryOut {
	similar_prior_fix: boolean;
	similar_commit: string;
	conventions: string;
}

export function historyEvidence(ctx: TaskCtx): string {
	return `## Issue title\n\n${ctx.snapshot.title}\n\n${renderHistory(ctx)}`;
}

export async function historyAgent(ctx: TaskCtx, budget: Budget): Promise<HistoryOut> {
	const p = loadPrompt("history-agent");
	return callAgent<HistoryOut>(
		{
			agent: "history_agent",
			round: 1,
			system: p.text,
			prompt: historyEvidence(ctx),
			schema: HISTORY_SCHEMA,
			inputManifest: ["issue-title", "git-log@base(touched files)"],
		},
		budget,
	);
}

// ---------- round 2 ----------

const REVISION_SCHEMA = (labelEnum: readonly string[]) =>
	({
		type: "object",
		properties: {
			revisions: {
				type: "array",
				items: {
					type: "object",
					properties: {
						item: { type: "string" },
						label: { type: "string", enum: [...labelEnum] },
						consistent_with_reference: { type: "boolean" },
						reason: { type: "string" },
					},
					required: ["item", "label", "reason"],
				},
			},
			fairness: { type: "string", enum: [...FAIR, "unchanged"] },
			similar_prior_fix: { type: "string", enum: ["true", "false", "unchanged"] },
			objection: {
				type: "object",
				properties: {
					to_agent: { type: "string" },
					item: { type: "string" },
					reason: { type: "string" },
				},
				required: ["to_agent", "reason"],
			},
		},
		required: ["revisions", "fairness", "similar_prior_fix"],
	}) as const;

export interface RevisionOut {
	revisions: { item: string; label: string; consistent_with_reference?: boolean; reason: string }[];
	fairness: Fair | "unchanged";
	similar_prior_fix: "true" | "false" | "unchanged";
	objection?: { to_agent: string; item?: string; reason: string };
}

export function renderRecord(record: Verdict[]): string {
	return record
		.map(
			(v) =>
				`- [${v.agent}, round ${v.round}] ${v.decision}${v.item ? ` on ${v.item}` : ""}: ${JSON.stringify(v.value)}${v.evidence ? ` — evidence: ${v.evidence.slice(0, 400)}` : ""}`,
		)
		.join("\n");
}

export async function revise(
	agent: "gold_comparer" | "test_auditor" | "history_agent",
	ctx: TaskCtx,
	own: string,
	record: Verdict[],
	budget: Budget,
): Promise<RevisionOut> {
	const r2 = loadPrompt("round2");
	const base =
		agent === "gold_comparer"
			? { system: LEAK_SYSTEM_PROMPT + loadPrompt("gold-comparer").text, ev: goldEvidence(ctx), man: ["issue@T*", "reference.patch"] }
			: agent === "test_auditor"
				? { system: loadPrompt("test-auditor").text, ev: auditEvidence(ctx), man: ["issue@T*", "tests.patch", "validation"] }
				: { system: loadPrompt("history-agent").text, ev: historyEvidence(ctx), man: ["issue-title", "git-log@base(touched files)"] };
	const others = record.filter((v) => v.agent !== agent);
	return callAgent<RevisionOut>(
		{
			agent,
			round: 2,
			system: base.system + r2.text,
			prompt: `${base.ev}\n\n## Your round-1 verdicts\n\n${own}\n\n## Shared record (other agents, round 1)\n\n${renderRecord(others)}\n`,
			schema: REVISION_SCHEMA(LEAK_LEVELS),
			inputManifest: [...base.man, "record@round1"],
		},
		budget,
	);
}
