/**
 * The three curation arms (add-task-curation-collective 2.1, 2.3, 2.4, D2, D5–D7).
 * Every arm returns the same CurationOutput schema.
 */
import { LEAK_LEVELS, type LeakLevel } from "../bundle";
import { LEAK_SCHEMA, LEAK_SYSTEM_PROMPT } from "../classify";
import {
	renderHistory,
	renderReference,
	renderTests,
	renderThread,
	type TaskCtx,
	threadItems,
} from "./evidence";
import { Budget, CURATION_MODEL, callAgent, loadPrompt, OverBudgetError } from "./invoke";
import {
	type AuditOut,
	type GoldOut,
	goldComparer,
	type HistoryOut,
	historyAgent,
	type IssueReaderOut,
	issueReader,
	revise,
	testAuditor,
} from "./roles";
import {
	difficultyRule,
	type Fairness,
	fairnessQuorum,
	issueReaderVotes,
	leakQuorum,
	ruleHash,
	type Vote,
} from "./quorum";
import type { Arm, CurationOutput, Verdict } from "./schema";

const FAIR = ["fair", "unfair", "unsure"] as const;

function promptHashes(names: string[]): Record<string, string> {
	return Object.fromEntries(names.map((n) => [n, loadPrompt(n).hash]));
}

function emptyOutput(arm: Arm, ctx: TaskCtx, budget: Budget): CurationOutput {
	return {
		arm,
		task: ctx.task,
		items: [],
		fairness: { verdict: "unsure", reason: "" },
		eligibility: { excludeTests: [], appEgressNeeded: false, note: "", advisory: true },
		difficulty: "medium",
		overBudget: budget.over,
		spendUsd: budget.spent,
		capUsd: budget.capUsd,
		provenance: { promptHashes: {}, models: [CURATION_MODEL], calls: budget.calls },
	};
}

// ---------- single (D2) ----------

const SINGLE_SCHEMA = {
	type: "object",
	properties: {
		items: LEAK_SCHEMA.properties.items,
		fairness: { type: "string", enum: [...FAIR] },
		fairness_reason: { type: "string" },
		exclude_tests: { type: "array", items: { type: "string" } },
		needs_live_api: { type: "boolean" },
		difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
	},
	required: ["items", "fairness", "fairness_reason", "exclude_tests", "needs_live_api", "difficulty"],
} as const;

export async function runSingle(ctx: TaskCtx, capUsd: number): Promise<CurationOutput> {
	const budget = new Budget(capUsd);
	const out = emptyOutput("single", ctx, budget);
	const add = loadPrompt("single");
	const items = threadItems(ctx);
	try {
		const r = await callAgent<{
			items: GoldOut["items"];
			fairness: Fairness;
			fairness_reason: string;
			exclude_tests: string[];
			needs_live_api: boolean;
			difficulty: CurationOutput["difficulty"];
		}>(
			{
				agent: "single",
				system: LEAK_SYSTEM_PROMPT + add.text,
				prompt: `${renderReference(ctx)}\n${renderThread(ctx, items)}\n${renderTests(ctx)}\n${renderHistory(ctx)}`,
				schema: SINGLE_SCHEMA,
				inputManifest: ["issue@T*", "reference.patch", "tests.patch", "validation", "git-log@base(touched files)"],
			},
			budget,
		);
		const byId = new Map(r.items.map((x) => [x.id, x]));
		out.items = items.map((it) => {
			const g = byId.get(it.id);
			return g
				? { ...g, author: it.author, role: it.role }
				: { id: it.id, label: "unlabeled" as const, consistent_with_reference: true, reveals_files: [], evidence: "", rationale: "skipped", author: it.author, role: it.role };
		});
		out.fairness = { verdict: r.fairness, reason: r.fairness_reason };
		out.eligibility = { excludeTests: r.exclude_tests, appEgressNeeded: r.needs_live_api, note: "", advisory: true };
		out.difficulty = r.difficulty;
	} catch (e) {
		if (!(e instanceof OverBudgetError)) throw e;
	}
	out.overBudget = budget.over;
	out.spendUsd = budget.spent;
	out.provenance.promptHashes = { "leak-system": loadPrompt("single").hash };
	return out;
}

// ---------- collective (D5, D6) ----------

export interface CollectiveResult {
	output: CurationOutput;
	record: Verdict[];
	issueReader?: IssueReaderOut;
}

function leakOf(label: string): LeakLevel | null {
	return (LEAK_LEVELS as readonly string[]).includes(label) ? (label as LeakLevel) : null;
}

export async function runCollective(ctx: TaskCtx, capUsd: number): Promise<CollectiveResult> {
	const budget = new Budget(capUsd);
	const out = emptyOutput("collective", ctx, budget);
	const record: Verdict[] = [];
	const items = threadItems(ctx);
	const post = (v: Omit<Verdict, "evidence"> & { evidence?: string }) =>
		record.push({ evidence: "", ...v } as Verdict);

	// Round 1: every role on its own evidence, in parallel; failures are abstentions.
	const settle = async <T>(p: Promise<T>): Promise<T | null> => {
		try {
			return await p;
		} catch (e) {
			if (e instanceof OverBudgetError) return null;
			console.error(`  ${ctx.task}: role failed: ${(e as Error).message.slice(0, 200)}`);
			return null;
		}
	};
	const [ir, gold, audit, hist] = await Promise.all([
		settle(issueReader(ctx, budget)),
		settle(goldComparer(ctx, budget)),
		settle(testAuditor(ctx, budget)),
		settle(historyAgent(ctx, budget)),
	]);

	const irVotes: Vote[] = ir ? issueReaderVotes(ir.prefixes.map((p) => p.localizes)) : items.map(() => null);
	ir?.prefixes.forEach((p, k) =>
		post({ agent: "issue_reader", round: 1, decision: "localize", item: p.id, value: { files: p.files, localizes: p.localizes, vote: irVotes[k] } }),
	);
	const goldBy = new Map<string, { label: LeakLevel; consistent: boolean; item: GoldOut["items"][number] }>();
	for (const g of gold?.items ?? []) {
		goldBy.set(g.id, { label: g.label, consistent: g.consistent_with_reference, item: g });
		post({ agent: "gold_comparer", round: 1, decision: "leak", item: g.id, value: { label: g.label, consistent_with_reference: g.consistent_with_reference, reveals_files: g.reveals_files }, evidence: g.evidence });
	}
	if (gold) post({ agent: "gold_comparer", round: 1, decision: "fairness", value: gold.fairness, evidence: gold.fairness_reason });
	const auditBy = new Map<string, LeakLevel>();
	for (const a of audit?.items ?? []) {
		auditBy.set(a.id, a.label);
		post({ agent: "test_auditor", round: 1, decision: "leak", item: a.id, value: { label: a.label }, evidence: a.evidence });
	}
	if (audit) {
		post({ agent: "test_auditor", round: 1, decision: "fairness", value: audit.fairness, evidence: audit.fairness_reason });
		post({ agent: "test_auditor", round: 1, decision: "eligibility", value: { exclude_tests: audit.exclude_tests, needs_live_api: audit.needs_live_api }, evidence: audit.eligibility_note });
	}
	if (hist) post({ agent: "history_agent", round: 1, decision: "similar_fix", value: { similar_prior_fix: hist.similar_prior_fix, commit: hist.similar_commit }, evidence: hist.conventions });

	// Round 2: everyone but the issue reader reads the round-1 record and may post one revision.
	let goldFair: Fairness | null = gold?.fairness ?? null;
	let auditFair: Fairness | null = audit?.fairness ?? null;
	let similar = hist?.similar_prior_fix ?? false;
	const round1 = [...record];
	const r2 = await Promise.all([
		gold ? settle(revise("gold_comparer", ctx, JSON.stringify({ items: gold.items.map((g) => ({ id: g.id, label: g.label, consistent_with_reference: g.consistent_with_reference })), fairness: gold.fairness }), round1, budget)) : null,
		audit ? settle(revise("test_auditor", ctx, JSON.stringify({ items: audit.items.map((a) => ({ id: a.id, label: a.label })), fairness: audit.fairness }), round1, budget)) : null,
		hist ? settle(revise("history_agent", ctx, JSON.stringify(hist), round1, budget)) : null,
	]);
	const [g2, a2, h2] = r2;
	for (const rv of g2?.revisions ?? []) {
		const prev = goldBy.get(rv.item);
		const lvl = leakOf(rv.label);
		if (!prev || !lvl) continue;
		const consistent = rv.consistent_with_reference ?? prev.consistent;
		goldBy.set(rv.item, { ...prev, label: lvl, consistent, item: { ...prev.item, label: lvl, consistent_with_reference: consistent } });
		post({ agent: "gold_comparer", round: 2, decision: "leak", item: rv.item, value: { label: lvl, consistent_with_reference: consistent }, evidence: rv.reason });
	}
	if (g2 && g2.fairness !== "unchanged") {
		goldFair = g2.fairness;
		post({ agent: "gold_comparer", round: 2, decision: "fairness", value: g2.fairness });
	}
	for (const rv of a2?.revisions ?? []) {
		const lvl = leakOf(rv.label);
		if (!lvl || !auditBy.has(rv.item)) continue;
		auditBy.set(rv.item, lvl);
		post({ agent: "test_auditor", round: 2, decision: "leak", item: rv.item, value: { label: lvl }, evidence: rv.reason });
	}
	if (a2 && a2.fairness !== "unchanged") {
		auditFair = a2.fairness;
		post({ agent: "test_auditor", round: 2, decision: "fairness", value: a2.fairness });
	}
	if (h2 && h2.similar_prior_fix !== "unchanged") {
		similar = h2.similar_prior_fix === "true";
		post({ agent: "history_agent", round: 2, decision: "similar_fix", value: { similar_prior_fix: similar } });
	}
	for (const [who, r] of [["gold_comparer", g2], ["test_auditor", a2], ["history_agent", h2]] as const)
		if (r?.objection?.reason)
			post({ agent: who, round: 2, decision: "objection", item: r.objection.item, value: r.objection.reason, objects_to: r.objection.to_agent });

	// Quorum (code).
	out.items = items.map((it, k) => {
		const g = goldBy.get(it.id);
		const label = leakQuorum({
			gold: g ? { label: g.label, consistent: g.consistent } : null,
			issueReader: irVotes[k] ?? null,
			testAuditor: auditBy.get(it.id) ?? null,
		});
		return {
			id: it.id,
			label,
			consistent_with_reference: g?.consistent ?? true,
			reveals_files: g?.item.reveals_files ?? [],
			evidence: g?.item.evidence ?? "",
			rationale: `quorum: gold=${g?.label ?? "-"}${g && !g.consistent ? "(inconsistent)" : ""} reader=${irVotes[k] ?? "abstain"} auditor=${auditBy.get(it.id) ?? "abstain"}`,
			author: it.author,
			role: it.role,
		};
	});
	out.fairness = {
		verdict: fairnessQuorum(auditFair, goldFair),
		reason: `test_auditor=${auditFair ?? "-"}, gold_comparer=${goldFair ?? "-"}`,
	};
	out.eligibility = {
		excludeTests: audit?.exclude_tests ?? [],
		appEgressNeeded: audit?.needs_live_api ?? false,
		note: audit?.eligibility_note ?? "",
		advisory: true,
	};
	out.difficulty = difficultyRule({
		refLines: ctx.refLines,
		bodyLocalizes: ir?.prefixes[0]?.localizes ?? false,
		similarPriorFix: similar,
	});
	out.overBudget = budget.over;
	out.spendUsd = budget.spent;
	out.provenance.ruleHash = ruleHash();
	out.provenance.promptHashes = promptHashes(["issue-reader", "gold-comparer", "test-auditor", "history-agent", "round2"]);
	return { output: out, record, issueReader: ir ?? undefined };
}

// ---------- controller (D7) ----------

const CONTROLLER_SCHEMA = {
	type: "object",
	properties: {
		action: { type: "string", enum: ["call", "final"] },
		tool: { type: "string", enum: ["issue_reader", "gold_comparer", "test_auditor", "history_agent"] },
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					label: { type: "string", enum: [...LEAK_LEVELS] },
					rationale: { type: "string" },
				},
				required: ["id", "label", "rationale"],
			},
		},
		fairness: { type: "string", enum: [...FAIR] },
		fairness_reason: { type: "string" },
		exclude_tests: { type: "array", items: { type: "string" } },
		needs_live_api: { type: "boolean" },
		difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
	},
	required: ["action"],
} as const;

interface ControllerStep {
	action: "call" | "final";
	tool?: "issue_reader" | "gold_comparer" | "test_auditor" | "history_agent";
	items?: { id: string; label: LeakLevel; rationale: string }[];
	fairness?: Fairness;
	fairness_reason?: string;
	exclude_tests?: string[];
	needs_live_api?: boolean;
	difficulty?: CurationOutput["difficulty"];
}

export async function runController(ctx: TaskCtx, capUsd: number): Promise<CollectiveResult> {
	const budget = new Budget(capUsd);
	const out = emptyOutput("controller", ctx, budget);
	const record: Verdict[] = [];
	const items = threadItems(ctx);
	const sys = loadPrompt("controller");
	const results: string[] = [];
	const called = new Set<string>();
	const tools: Record<string, () => Promise<unknown>> = {
		issue_reader: async () => {
			const r = await issueReader(ctx, budget);
			return { prefixes: r.prefixes.map((p) => ({ through: p.id, files: p.files, covered_every_fix_file: p.localizes })) };
		},
		gold_comparer: async () => {
			const g = await goldComparer(ctx, budget);
			return { items: g.items.map(({ id, label, consistent_with_reference, evidence }) => ({ id, label, consistent_with_reference, evidence })), fairness: g.fairness, fairness_reason: g.fairness_reason };
		},
		test_auditor: async () => testAuditor(ctx, budget),
		history_agent: async () => historyAgent(ctx, budget),
	};
	const itemList = items.map((it) => `- ${it.id}: @${it.author}${it.isBot ? " [bot]" : ""}`).join("\n");
	let final: ControllerStep | null = null;
	try {
		for (let turn = 0; turn < 6 && !final; turn++) {
			const forceFinal = turn === 5 || called.size === 4;
			const step = await callAgent<ControllerStep>(
				{
					agent: "controller",
					round: turn + 1,
					system: sys.text,
					prompt: `## Items to label\n\n${itemList}\n\n## Tools already called: ${[...called].join(", ") || "none"}\n\n## Tool results so far\n\n${results.join("\n\n") || "(none)"}\n\n${forceFinal ? "You must finish now: action \"final\" with every item labeled." : ""}`,
					schema: CONTROLLER_SCHEMA,
					inputManifest: ["item-ids", "tool-results"],
				},
				budget,
			);
			if (step.action === "final" && step.items?.length) {
				final = step;
				break;
			}
			const tool = step.tool && !called.has(step.tool) ? step.tool : (["gold_comparer", "test_auditor", "issue_reader", "history_agent"].find((t) => !called.has(t)) as ControllerStep["tool"]);
			if (!tool) continue;
			called.add(tool);
			let res: unknown;
			try {
				res = await (tools[tool] as () => Promise<unknown>)();
			} catch (e) {
				if (e instanceof OverBudgetError) throw e;
				res = { error: (e as Error).message.slice(0, 200) };
			}
			results.push(`### ${tool}\n${JSON.stringify(res).slice(0, 12000)}`);
			record.push({ agent: "controller", round: 1, decision: "tool_call", value: { called: tool }, evidence: "" } as Verdict);
		}
	} catch (e) {
		if (!(e instanceof OverBudgetError)) throw e;
	}
	if (final) {
		const byId = new Map((final.items ?? []).map((x) => [x.id, x]));
		out.items = items.map((it) => {
			const f = byId.get(it.id);
			return { id: it.id, label: f?.label ?? ("unlabeled" as const), consistent_with_reference: true, reveals_files: [], evidence: "", rationale: f?.rationale ?? "not labeled", author: it.author, role: it.role };
		});
		out.fairness = { verdict: final.fairness ?? "unsure", reason: final.fairness_reason ?? "" };
		out.eligibility = { excludeTests: final.exclude_tests ?? [], appEgressNeeded: final.needs_live_api ?? false, note: "", advisory: true };
		out.difficulty = final.difficulty ?? "medium";
	}
	out.overBudget = budget.over;
	out.failed = !final && !budget.over;
	out.spendUsd = budget.spent;
	out.provenance.promptHashes = promptHashes(["controller", "issue-reader", "gold-comparer", "test-auditor", "history-agent"]);
	return { output: out, record };
}
