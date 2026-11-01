// bun build-cands.ts <owner/repo> <det.jsonl> <out.json> [maxN] [onlyPRs,comma]
import { $ } from "bun";
const [repo, det, out, maxN, only] = process.argv.slice(2);
const want = only ? new Set(only.split(",").map(Number)) : null;
const rows = (await Bun.file(det).text()).trim().split("\n").map((l) => JSON.parse(l));
let picked = rows.filter((p: any) => {
	if (want) return want.has(p.number);
	const first = p.commits.nodes.map((n: any) => n.commit.authoredDate).sort()[0];
	return p.closingIssuesReferences.nodes.some((i: any) => i.repository.nameWithOwner === repo && i.createdAt < first && i.author?.login !== p.author?.login);
}).sort((a: any, b: any) => a.number - b.number);
if (maxN && picked.length > Number(maxN)) { const step = picked.length / Number(maxN); picked = Array.from({ length: Number(maxN) }, (_, k) => picked[Math.floor(k * step)]); }
const cands = [];
for (const p of picked) {
	const m = (await $`gh pr view ${p.number} -R ${repo} --json mergeCommit -q .mergeCommit.oid`.text()).trim();
	cands.push({ n: p.number, m, d: p.mergedAt, issues: p.closingIssuesReferences.nodes.map((i: any) => ({ n: i.number, repo: i.repository.nameWithOwner })) });
}
await Bun.write(out, JSON.stringify(cands, null, 2));
console.log(repo, cands.length, "candidates:", cands.map((c) => c.n).join(","));
