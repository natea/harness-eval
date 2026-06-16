#!/usr/bin/env bun
/**
 * Backfill readable transcript renderings for archived trials
 * (trial-transcript-audit):
 *
 *   bun scripts/render-transcripts.ts <run-dir> [trial-id]
 *
 * Writes `transcripts/conversation.md` + `session-NNN.md` for each trial from
 * the existing redacted `session-NNN.jsonl`. Pure derivation — never creates,
 * modifies, or deletes any `.jsonl`, grades, results, or workspace file, so it
 * is safe to run over `runs/` ground truth and is idempotent (it only
 * overwrites the derived Markdown).
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderTrial, sessionFiles } from "../src/report/transcript-render";

const [runDir, onlyTrial] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!runDir)
	throw new Error("usage: render-transcripts.ts <run-dir> [trial-id]");

const trialsRoot = join(runDir, "trials");
if (!existsSync(trialsRoot)) throw new Error(`no trials/ under ${runDir}`);

const trialIds = (onlyTrial ? [onlyTrial] : readdirSync(trialsRoot)).filter((id) =>
	existsSync(join(trialsRoot, id, "transcripts")),
);

let rendered = 0;
let skipped = 0;
for (const id of trialIds) {
	const trialDir = join(trialsRoot, id);
	const sessions = sessionFiles(join(trialDir, "transcripts"));
	if (sessions.length === 0) {
		console.log(`[render] ${id}: no session-NNN.jsonl — skipped`);
		skipped++;
		continue;
	}
	const out = renderTrial(trialDir);
	for (const s of out.sessions) {
		writeFileSync(
			join(trialDir, "transcripts", s.name.replace(/\.jsonl$/, ".md")),
			s.md,
		);
	}
	writeFileSync(
		join(trialDir, "transcripts", "conversation.md"),
		out.conversationMd,
	);
	const turns = out.sessions.reduce((n, s) => n + s.turns.length, 0);
	console.log(
		`[render] ${id}: ${out.sessions.length} session(s), ${turns} turns → conversation.md`,
	);
	rendered++;
}

console.log(`[render] done: ${rendered} trial(s) rendered, ${skipped} skipped`);
