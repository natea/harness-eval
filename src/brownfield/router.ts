/**
 * Framework routing step for brownfield sessions.
 *
 * Some frameworks ship no prescribed entry command and rely on auto-engagement
 * (e.g. Superpowers' startup hook). Observed 2026-11-01: on a small bug fix the
 * model ignored the hook and used plain Claude Code, so the trial measured the
 * model, not the framework. For such candidates the first step asks the agent to
 * consult the framework's own help or usage guidance, name the command or skill it
 * prescribes for this task, and invoke it.
 *
 * Fairness: the wrapper is identical for every framework apart from its name and
 * carries no task-specific content (registry rule: sessions may add only the
 * framework's own prescribed commands). Candidates whose session already starts
 * with their own command (e.g. GSD's `/gsd-new-project`) are left unchanged, and
 * `bare` (no framework) is never routed.
 */

import type { CandidateEntry } from "../types";

export const ROUTER_TEMPLATE =
	"The {{FRAMEWORK}} framework is installed in this session. Use it to do this task rather than working without it. First consult {{FRAMEWORK}}'s own help or usage guidance (its help command, or its skill for how to use it) to decide which of its commands or skills fits this task. Say which one you chose and why, then invoke it and follow its workflow.";

export function routerPrompt(frameworkName: string): string {
	return ROUTER_TEMPLATE.replaceAll("{{FRAMEWORK}}", frameworkName);
}

/** True when the candidate's first step is only the base prompt (no framework command). */
export function needsRouting(
	candidate: CandidateEntry,
	harness: string,
): boolean {
	if (candidate.id === "bare") return false;
	const first = candidate.harnesses[harness]?.session[0]?.prompt ?? "";
	return !/^\s*[/$]/.test(first);
}

/** The candidate with its brownfield session, when the registry defines one. */
export function withBrownfieldSession(
	candidate: CandidateEntry,
	harness: string,
): CandidateEntry {
	const setup = candidate.harnesses[harness];
	if (!setup?.brownfieldSession) return candidate;
	return {
		...candidate,
		harnesses: {
			...candidate.harnesses,
			[harness]: { ...setup, session: setup.brownfieldSession },
		},
	};
}

/** The candidate with the routing step prepended to its first session prompt. */
export function withRouting(
	candidate: CandidateEntry,
	harness: string,
): CandidateEntry {
	if (!needsRouting(candidate, harness)) return candidate;
	const setup = candidate.harnesses[harness];
	if (!setup) return candidate;
	const [first, ...rest] = setup.session;
	if (!first) return candidate;
	return {
		...candidate,
		harnesses: {
			...candidate.harnesses,
			[harness]: {
				...setup,
				session: [
					{
						...first,
						prompt: `${routerPrompt(candidate.name)}\n\n${first.prompt}`,
					},
					...rest,
				],
			},
		},
	};
}
