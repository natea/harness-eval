/**
 * Provider-side web tool kill-switch (task 4.6). Brownfield trials must not have
 * server-side web search/fetch: a worker could look up the upstream fix.
 */
import type { HarnessId } from "../types";

export class ToolPolicyError extends Error {}

/** Harnesses with a verified mechanism; value documents the flag used. */
const KILL_SWITCH: Record<string, string> = {
	"claude-code": "--disallowedTools WebSearch WebFetch",
	codex: "-c tools.web_search=false",
};

export function hasWebToolKillSwitch(harness: HarnessId): boolean {
	return harness in KILL_SWITCH;
}

/** Refuse a brownfield run whose harness cannot disable provider-side web tools. */
export function assertWebToolKillSwitch(harness: HarnessId): void {
	if (!hasWebToolKillSwitch(harness))
		throw new ToolPolicyError(
			`harness '${harness}' has no verified web-tool kill-switch; ` +
				`brownfield trials refuse unverifiable harnesses (task 4.6)`,
		);
}
