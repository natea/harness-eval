// Spike: LLM leak classifier for issue snapshots (mining-side only; workers never see this).
// Labels the body and each pre-T* comment by how much of the REFERENCE fix it reveals.
// Usage: bun classify.ts [pr...]   Requires CLAUDE_CODE_OAUTH_TOKEN in harness-eval/.env.
import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const S = import.meta.dir;
const SNAP = process.env.SNAP_DIR ?? `${S}/snapshots`, OUT = process.env.LEAK_DIR ?? `${S}/leaks`;
mkdirSync(OUT, { recursive: true });
const REPO = process.env.REPO_DIR ?? `${process.env.HOME}/Documents/code/paper-qa`;
const GH_REPO = process.env.GH_REPO ?? "Future-House/paper-qa";
const ONLY_VALID = process.env.ONLY_VALID ? new Set<number>(JSON.parse(readFileSync(process.env.ONLY_VALID, "utf8")).filter((r: any) => r.verdict === "VALID").map((r: any) => r.pr)) : null;
const MODEL = process.env.LEAK_MODEL ?? "claude-sonnet-5-5";
const MAINTAINERS = new Set(["jamesbraza", "mskarlin", "whitead"]);
const LEVELS = ["noise", "symptom", "diagnosis", "fix_sketch", "fix_code"] as const;
const PATCH_MAX = 20_000, TEXT_MAX = 6_000;

const token = readFileSync(`${process.env.HOME}/Documents/code/harness-eval/.env`, "utf8").match(/^CLAUDE_CODE_OAUTH_TOKEN=(.*)$/m)?.[1]?.trim();
if (!token) throw new Error("CLAUDE_CODE_OAUTH_TOKEN missing");

const SCHEMA = {
	type: "object",
	properties: {
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					label: { type: "string", enum: [...LEVELS] },
					consistent_with_reference: { type: "boolean", description: "If it diagnoses/proposes something, does that match what the reference fix actually does?" },
					reveals_files: { type: "array", items: { type: "string" }, description: "Files/functions changed by the reference fix that this text names or clearly points to" },
					evidence: { type: "string", description: "Shortest verbatim quote that justifies the label, or empty" },
					rationale: { type: "string" },
				},
				required: ["id", "label", "consistent_with_reference", "reveals_files", "evidence", "rationale"],
			},
		},
	},
	required: ["items"],
};

const SYSTEM = `You audit benchmark tasks for solution leakage. A coding agent will be given a GitHub issue (and, in one condition, the discussion comments written before any fix work began) and asked to fix it in the repository. You are given the REFERENCE fix that was actually merged. For the issue body and each comment, decide how much of the reference fix the text gives away to a competent developer who has the repository but not the fix.

Labels (pick the highest that applies):
- noise: no technical content about the problem (thanks, +1, scheduling, "I'll look into it").
- symptom: observed behavior, reproduction steps, tracebacks, logs, versions, environment. A traceback that names the crashing function is still symptom. A wrong or unconfirmed guess at the cause is symptom.
- diagnosis: identifies the root cause or the specific code location/mechanism that the reference fix changes, beyond what the traceback alone shows.
- fix_sketch: describes the change to make, in prose or pseudocode, consistent with the reference fix.
- fix_code: contains code that is substantially the reference fix (would mostly solve it if pasted).

Judge only against the reference fix: a diagnosis or proposal that points somewhere the reference fix did not go is NOT a leak (label it symptom and set consistent_with_reference=false). Workarounds that avoid the bug without fixing it (e.g. "install a different package") are symptom unless they reveal the mechanism. Be strict and concrete; quote evidence verbatim. Return one item per input id, in order.`;

function role(login: string, issueAuthor: string, prAuthor: string, assoc?: string) {
	if (login === prAuthor) return "future fixer (author of the reference PR)";
	if (login === issueAuthor) return "issue author";
	if (MAINTAINERS.has(login) || ["OWNER", "MEMBER", "COLLABORATOR"].includes(assoc ?? "")) return "maintainer";
	return "other user";
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s);

async function classify(file: string) {
	const snap = JSON.parse(readFileSync(`${SNAP}/${file}`, "utf8"));
	const out = `${OUT}/${snap.pr}-${snap.issue}.json`;
	if (existsSync(out)) return JSON.parse(readFileSync(out, "utf8"));
	const cand = JSON.parse(readFileSync(process.env.CANDS ?? `${S}/candidates.json`, "utf8")).find((c: any) => c.n === snap.pr);
	const prAuthor = (await $`gh pr view ${snap.pr} -R ${GH_REPO} --json author -q .author.login`.text()).trim();
	const files = (await $`git -C ${REPO} diff --name-only ${cand.m}^ ${cand.m}`.text()).trim().split("\n");
	const src = files.filter((f) => !/(^|\/)tests?\//.test(f) && !/test_[^/]*\.py$/.test(f));
	const patch = src.length ? await $`git -C ${REPO} diff ${cand.m}^ ${cand.m} -- ${src}`.text() : "(no non-test changes)";

	const items = [
		{ id: "body", author: snap.issueAuthor, role: "issue author", text: snap.body },
		...snap.comments.map((c: any, i: number) => ({ id: `c${i + 1}`, author: c.author, role: c.isBot ? "bot" : role(c.author, snap.issueAuthor, prAuthor, c.assoc), text: c.text })),
	];
	const prompt = `## Reference fix (merged PR, non-test files only)\n\n\`\`\`diff\n${clip(patch, PATCH_MAX)}\n\`\`\`\n\n## Issue title\n\n${snap.title}\n\n## Texts to label\n\n` +
		items.map((it) => `### id=${it.id} — @${it.author} (${it.role})\n\n${clip(it.text, TEXT_MAX)}\n`).join("\n");

	const p = Bun.spawn(["claude", "-p", "--model", MODEL, "--tools", "", "--strict-mcp-config", "--setting-sources", "",
		"--system-prompt", SYSTEM, "--output-format", "json", "--json-schema", JSON.stringify(SCHEMA)], {
		cwd: "/private/tmp", stdin: new TextEncoder().encode(prompt), stdout: "pipe", stderr: "pipe",
		env: { ...process.env, ANTHROPIC_API_KEY: "", CLAUDE_CODE_OAUTH_TOKEN: token },
	});
	const [stdout, code] = [await new Response(p.stdout).text(), await p.exited];
	const res = JSON.parse(stdout);
	if (code !== 0 || res.is_error || !res.structured_output) throw new Error(`claude failed: ${stdout.slice(0, 300)}`);
	const labeled = res.structured_output.items.map((x: any) => ({ ...x, author: items.find((i) => i.id === x.id)?.author, role: items.find((i) => i.id === x.id)?.role }));
	const rank = (l: string) => LEVELS.indexOf(l as any);
	const maxOf = (xs: any[]) => xs.reduce((m, x) => (rank(x.label) > rank(m) ? x.label : m), "noise");
	const result = {
		pr: snap.pr, issue: snap.issue, model: MODEL, cost: res.total_cost_usd, prAuthor,
		bodyLevel: labeled.find((x: any) => x.id === "body")?.label,
		commentsLevel: maxOf(labeled.filter((x: any) => x.id !== "body")),
		items: labeled,
	};
	writeFileSync(out, JSON.stringify(result, null, 2));
	return result;
}

const only = process.argv.slice(2).map(Number);
const queue = readdirSync(SNAP).filter((f) => f.endsWith(".snapshot.json") && (!only.length || only.includes(Number(f.split("-")[0]))) && (!ONLY_VALID || ONLY_VALID.has(Number(f.split("-")[0]))));
const results: any[] = [];
await Promise.all(Array.from({ length: 4 }, async () => {
	while (queue.length) {
		const f = queue.shift()!;
		try { results.push(await classify(f)); } catch (e) { results.push({ file: f, error: String(e).slice(0, 300) }); }
	}
}));
results.sort((a, b) => (b.pr ?? 0) - (a.pr ?? 0));
writeFileSync(`${OUT}/summary.json`, JSON.stringify(results.map(({ items, ...r }) => r), null, 2));
console.table(results.map((r) => ({ pr: r.pr, issue: r.issue, body: r.bodyLevel, comments: r.commentsLevel, n: r.items?.length, cost: r.cost?.toFixed(3), err: r.error?.slice(0, 60) })));
console.log("total $", results.reduce((s, r) => s + (r.cost ?? 0), 0).toFixed(2));
