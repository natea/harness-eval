// Spike: reconstruct a GitHub issue as it looked at T* (just before any sign of the fix).
// T* = min(PR createdAt, PR first commit authored/committed date, first cross-ref from the PR).
// Usage: bun snapshot.ts [pr...]   (default: all in candidates.json)
import { $ } from "bun";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const S = import.meta.dir;
const OUT = process.env.SNAP_DIR ?? `${S}/snapshots`;
mkdirSync(OUT, { recursive: true });
const [OWNER, NAME] = (process.env.GH_REPO ?? "Future-House/paper-qa").split("/");

const EDITS = `userContentEdits(first: 100) { nodes { editedAt createdAt deletedAt diff editor { login } } }`;
const Q = `query($o:String!,$n:String!,$pr:Int!,$is:Int!){ repository(owner:$o,name:$n){
  pullRequest(number:$pr){ number title createdAt mergedAt url
    commits(first:100){ nodes{ commit{ oid authoredDate committedDate } } } }
  issue(number:$is){ number title body createdAt url state author{login} ${EDITS}
    comments(first:100){ nodes{ id createdAt authorAssociation author{login __typename} body url ${EDITS} } }
    timelineItems(first:250){ nodes{ __typename
      ... on LabeledEvent{ createdAt label{name} }
      ... on UnlabeledEvent{ createdAt label{name} }
      ... on RenamedTitleEvent{ createdAt previousTitle currentTitle }
      ... on AssignedEvent{ createdAt assignee{ ... on User{login} } }
      ... on UnassignedEvent{ createdAt assignee{ ... on User{login} } }
      ... on MilestonedEvent{ createdAt milestoneTitle }
      ... on DemilestonedEvent{ createdAt milestoneTitle }
      ... on ClosedEvent{ createdAt }
      ... on ReopenedEvent{ createdAt }
      ... on CrossReferencedEvent{ createdAt source{ __typename ... on PullRequest{number} ... on Issue{number} } }
      ... on ConnectedEvent{ createdAt subject{ ... on PullRequest{number} } }
      ... on ReferencedEvent{ createdAt commit{ oid } }
    } } } } }`;

type Edit = { editedAt: string; createdAt: string; deletedAt: string | null; diff: string | null; editor: { login: string } | null };

// Text as of T. Empirical model (verified below): edit nodes hold full post-edit text;
// the oldest node is the original version. No edits => current text is original.
function textAt(current: string, edits: Edit[], t: string): { text: string; source: string } {
	const live = edits.filter((e) => e.diff != null).sort((a, b) => a.editedAt.localeCompare(b.editedAt));
	if (live.length === 0) return { text: current, source: "no-edits" };
	const atOrBefore = live.filter((e) => e.editedAt <= t);
	if (atOrBefore.length) return { text: atOrBefore.at(-1)!.diff!, source: `edit@${atOrBefore.at(-1)!.editedAt}` };
	return { text: live[0].diff!, source: "oldest-edit(original)" };
}

const LEAK = [
	[/#\d{2,5}\b/, "mentions #N"],
	[/\b[0-9a-f]{7,40}\b/, "sha-like"],
	[/pull\/\d+|\bPR\b|pull request/i, "mentions PR"],
	[/\b(fix(ed|es)?|patch|workaround|root cause|the (bug|issue) is)\b/i, "fix language"],
	[/```(diff|patch)|^[-+]{1}\s.*$/m, "diff block"],
	[/```/, "code block"],
] as const;
const leakFlags = (s: string) => LEAK.filter(([re]) => re.test(s)).map(([, l]) => l);

async function snapshot(pr: number, issue: number) {
	const raw = await $`gh api graphql -f query=${Q} -F o=${OWNER} -F n=${NAME} -F pr=${pr} -F is=${issue}`.json();
	const repo = raw.data.repository, P = repo.pullRequest, I = repo.issue;
	writeFileSync(`${OUT}/${pr}-${issue}.raw.json`, JSON.stringify(raw, null, 2));

	// --- T* ---
	const commitTimes = P.commits.nodes.flatMap((n: any) => [n.commit.authoredDate, n.commit.committedDate]);
	const xrefs = I.timelineItems.nodes
		.filter((e: any) => (e.__typename === "CrossReferencedEvent" && e.source?.number === pr) || (e.__typename === "ConnectedEvent" && e.subject?.number === pr))
		.map((e: any) => e.createdAt);
	const signals: Record<string, string> = { prCreated: P.createdAt };
	if (commitTimes.length) signals.firstPrCommit = commitTimes.sort()[0];
	if (xrefs.length) signals.firstXref = xrefs.sort()[0];
	const tStar = Object.values(signals).sort()[0];
	const tCut = new Date(new Date(tStar).getTime() - 1000).toISOString();
	const cutBy = Object.entries(signals).find(([, v]) => v === tStar)![0];

	// --- replay metadata to T* ---
	let title = I.title;
	const renames = I.timelineItems.nodes.filter((e: any) => e.__typename === "RenamedTitleEvent").sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt));
	if (renames.length) {
		const before = renames.filter((r: any) => r.createdAt <= tCut);
		title = before.length ? before.at(-1).currentTitle : renames[0].previousTitle;
	}
	const labels = new Set<string>(), assignees = new Set<string>();
	let milestone: string | null = null, state = "OPEN";
	const after: string[] = [];
	for (const e of I.timelineItems.nodes as any[]) {
		if (!e.createdAt) continue;
		if (e.createdAt > tCut) { after.push(e.__typename.replace("Event", "")); continue; }
		if (e.__typename === "LabeledEvent") labels.add(e.label.name);
		if (e.__typename === "UnlabeledEvent") labels.delete(e.label.name);
		if (e.__typename === "AssignedEvent" && e.assignee) assignees.add(e.assignee.login);
		if (e.__typename === "UnassignedEvent" && e.assignee) assignees.delete(e.assignee.login);
		if (e.__typename === "MilestonedEvent") milestone = e.milestoneTitle;
		if (e.__typename === "DemilestonedEvent") milestone = null;
		if (e.__typename === "ClosedEvent") state = "CLOSED";
		if (e.__typename === "ReopenedEvent") state = "OPEN";
	}

	// --- body + comments at T* ---
	const body = textAt(I.body, I.userContentEdits.nodes, tCut);
	const bodyEditsAfter = I.userContentEdits.nodes.filter((e: Edit) => e.editedAt > tCut).length;
	const comments = I.comments.nodes.filter((c: any) => c.createdAt <= tCut).map((c: any) => {
		const t = textAt(c.body, c.userContentEdits.nodes, tCut);
		return { at: c.createdAt, author: c.author?.login ?? "ghost", isBot: c.author?.__typename === "Bot", assoc: c.authorAssociation, text: t.text, source: t.source, editedAfter: c.userContentEdits.nodes.filter((e: Edit) => e.editedAt > tCut).length, flags: leakFlags(t.text) };
	});
	const droppedComments = I.comments.nodes.length - comments.length;

	// Self-check of the edit model: newest edit text should equal live text.
	const newest = [...I.userContentEdits.nodes].filter((e: Edit) => e.diff != null).sort((a: Edit, b: Edit) => b.editedAt.localeCompare(a.editedAt))[0];
	const editModelOk = newest ? newest.diff!.trim() === (I.body ?? "").trim() : null;

	// --- render (no URLs/numbers that point at the future) ---
	const header = `# ${title}\n\n_Opened by @${I.author?.login ?? "ghost"} on ${I.createdAt.slice(0, 10)}_\n` +
		(labels.size ? `\nLabels: ${[...labels].join(", ")}\n` : "");
	const bodyOnly = `${header}\n${body.text.trim()}\n`;
	const withComments = bodyOnly + (comments.length ? "\n---\n\n## Discussion\n\n" + comments.map((c: any) => `**@${c.author}** (${c.at.slice(0, 10)}):\n\n${c.text.trim()}\n`).join("\n") : "");
	writeFileSync(`${OUT}/${pr}-${issue}.snapshot.json`, JSON.stringify({ pr, issue, tStar, title, issueAuthor: I.author?.login ?? "ghost", body: body.text, comments }, null, 2));
	writeFileSync(`${OUT}/${pr}-${issue}.body.md`, bodyOnly);
	writeFileSync(`${OUT}/${pr}-${issue}.body+comments.md`, withComments);
	writeFileSync(`${OUT}/${pr}-${issue}.live.md`, `# ${I.title}\n\n${I.body}\n\n` + I.comments.nodes.map((c: any) => `**@${c.author?.login}** (${c.createdAt.slice(0, 10)}):\n\n${c.body}\n`).join("\n"));

	return {
		pr, issue, issueCreated: I.createdAt.slice(0, 16), tStar: tStar.slice(0, 16), cutBy,
		issueBeforeFix: I.createdAt < tStar,
		titleChanged: title !== I.title, bodyEdits: I.userContentEdits.nodes.length, bodyEditsAfter, bodySource: body.source, editModelOk,
		bodyChangedVsLive: body.text.trim() !== (I.body ?? "").trim(),
		commentsKept: comments.length, commentsDropped: droppedComments,
		keptCommentFlags: comments.map((c: any) => c.flags.join("|")).filter(Boolean),
		labelsAtT: [...labels], liveEventsAfterT: [...new Set(after)],
		bodyFlags: leakFlags(body.text),
	};
}

const cands: any[] = JSON.parse(readFileSync(process.env.CANDS ?? `${S}/candidates.json`, "utf8"));
const only = process.argv.slice(2).map(Number);
const out: any[] = [];
for (const c of cands.filter((c) => !only.length || only.includes(c.n))) {
	for (const i of c.issues.filter((i: any) => i.repo === `${OWNER}/${NAME}`)) {
		try { out.push(await snapshot(c.n, i.n)); } catch (e) { out.push({ pr: c.n, issue: i.n, error: String(e).slice(0, 300) }); }
	}
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify(out, null, 2));
console.table(out.map((r) => ({ pr: r.pr, issue: r.issue, cutBy: r.cutBy, pre: r.issueBeforeFix, edits: `${r.bodyEdits}/${r.bodyEditsAfter}`, bodyΔ: r.bodyChangedVsLive, model: r.editModelOk, kept: r.commentsKept, drop: r.commentsDropped, flagged: r.keptCommentFlags?.length, err: r.error ? "ERR" : "" })));
