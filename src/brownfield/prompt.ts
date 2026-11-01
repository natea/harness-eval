/**
 * Brownfield base prompt (add-brownfield-track, design D11; task 4.2).
 *
 * The prompt is rendered ONCE per task and then diffused unchanged into every
 * candidate's session script, which is what makes prompts byte-identical across
 * candidates within a run (the same structural guarantee the PRD target prompt
 * has). It carries a generic anti-cheat clause and never names the fixing PR,
 * its commits, or its URL — the task's issue text is the only task content.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrownfieldTrialTask } from "../orchestrator/scheduler";
import {
	type Bundle,
	type IssueVariant,
	readSnapshot,
	readText,
	renderIssueVariant,
} from "./bundle";
import { bundleHash, taskRef } from "./run";

export const PROMPT_TEMPLATE_PATH = join("config", "brownfield-prompt.md");
/** Issue file name in the workspace root. Fixed so prompts are stable. */
export const ISSUE_FILE = "ISSUE.md";

const SLOT_RE = /\{\{([A-Z_]+)\}\}/g;

export class BrownfieldPromptError extends Error {}

export function loadPromptTemplate(path = PROMPT_TEMPLATE_PATH): string {
	return readFileSync(path, "utf8");
}

export interface PromptContext {
	/** `owner/repo`. */
	repo: string;
	issueFile: string;
}

/**
 * Fill `{{REPO}}` and `{{ISSUE_FILE}}`. A leftover slot is a template bug, not a
 * candidate difference, so it fails loudly: a silently unrendered `{{...}}` would
 * reach workers and break prompt fairness.
 */
export function renderBrownfieldPrompt(
	template: string,
	ctx: PromptContext,
): string {
	const vars: Record<string, string> = {
		REPO: ctx.repo,
		ISSUE_FILE: ctx.issueFile,
	};
	const out = template.replaceAll(SLOT_RE, (whole, name: string) =>
		name in vars ? (vars[name] as string) : whole,
	);
	const leftover = out.match(SLOT_RE);
	if (leftover) {
		throw new BrownfieldPromptError(
			`unfilled prompt slot(s): ${[...new Set(leftover)].join(", ")}`,
		);
	}
	return out;
}

/**
 * The issue text a worker sees for one task/variant. The bundle ships the three
 * rendered variants as frozen files; they are the ground truth (a re-render could
 * drift from the hashed bytes), and their presence is asserted.
 */
export function issueVariantText(b: Bundle, variant: IssueVariant): string {
	const text = readText(b.dir, join("issue", `${variant}.md`));
	if (text === null)
		throw new BrownfieldPromptError(
			`${b.dir}: missing rendered variant issue/${variant}.md`,
		);
	// Cross-check the frozen file against the snapshot: the variant must be what
	// the sealed snapshot renders, or the leak strata describe a different text.
	const rendered = renderIssueVariant(readSnapshot(b.dir), variant, {
		repo: b.manifest.repo,
		mergeSha: b.manifest.mergeSha,
	});
	if (rendered !== text) {
		throw new BrownfieldPromptError(
			`${b.dir}: issue/${variant}.md does not match snapshot rendering (frozen text drifted)`,
		);
	}
	return text;
}

/**
 * Build the run's task list: one rendered prompt per task (never per candidate),
 * the issue variant text, and the frozen identity recorded in provenance.
 */
export function planTasks(
	bundles: Bundle[],
	variant: IssueVariant,
	template: string,
): BrownfieldTrialTask[] {
	return bundles.map((b) => ({
		...taskRef(b, variant),
		bundleSha256: bundleHash(b),
		bundleDir: b.dir,
		prompt: renderBrownfieldPrompt(template, {
			repo: b.manifest.repo,
			issueFile: ISSUE_FILE,
		}),
		issueFile: ISSUE_FILE,
		issueContent: issueVariantText(b, variant),
	}));
}
