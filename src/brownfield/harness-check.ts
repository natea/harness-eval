/**
 * Post-install harness check: after the candidate's install steps and before the
 * agent starts, confirm Claude Code can actually see the framework (an enabled
 * plugin, or skills/commands/agents in the user or project config). A framework
 * candidate that exposes nothing fails the trial before any model spend; `bare`
 * is exempt. The result is recorded in provenance either way.
 */

import type { Sandbox } from "../providers/types";

export class HarnessCheckError extends Error {}

export const HARNESS_CHECK_COMMAND = [
	"echo '## plugins'",
	"claude plugin list 2>/dev/null || true",
	"echo '## dirs'",
	'for d in "$HOME/.claude/skills" "$HOME/.claude/commands" "$HOME/.claude/agents" .claude/skills .claude/commands .claude/agents .agents/skills; do [ -d "$d" ] && [ -n "$(ls -A "$d" 2>/dev/null)" ] && echo "$d: $(ls -A "$d" | head -40 | tr \'\\n\' \' \')"; done; true',
].join("; ");

export interface HarnessCheck {
	plugins: { name: string; version: string | null; enabled: boolean }[];
	dirs: string[];
	/** Something framework-shaped is visible to Claude Code. */
	visible: boolean;
}

export function parseHarnessCheck(out: string): HarnessCheck {
	const plugins: HarnessCheck["plugins"] = [];
	const dirs: string[] = [];
	let section = "";
	for (const raw of out.split("\n")) {
		const line = raw.trim();
		if (line === "## plugins" || line === "## dirs") {
			section = line;
			continue;
		}
		if (section === "## plugins") {
			const m = /^❯?\s*(\S+@\S+)$/.exec(line);
			if (m)
				plugins.push({ name: m[1] as string, version: null, enabled: false });
			const last = plugins.at(-1);
			const v = /^Version:\s*(\S+)/.exec(line);
			if (v && last) last.version = v[1] as string;
			if (/^Status:.*enabled/.test(line) && last) last.enabled = true;
		} else if (section === "## dirs" && line) dirs.push(line);
	}
	return {
		plugins,
		dirs,
		visible: plugins.some((p) => p.enabled) || dirs.length > 0,
	};
}

export function harnessCheckSummary(c: HarnessCheck): string {
	const p = c.plugins.map(
		(x) =>
			`${x.name}${x.version ? ` ${x.version}` : ""}${x.enabled ? "" : " (disabled)"}`,
	);
	return `harness check: plugins [${p.join(", ") || "none"}]; skills/commands [${c.dirs.join(" | ") || "none"}]`;
}

/** Run the check in the sandbox; throws for a framework candidate with nothing visible. */
export async function verifyHarness(
	sandbox: Sandbox,
	candidateId: string,
): Promise<string> {
	const r = await sandbox.exec(HARNESS_CHECK_COMMAND, { timeoutMs: 60_000 });
	const c = parseHarnessCheck(r.stdout);
	const summary = harnessCheckSummary(c);
	if (candidateId !== "bare" && !c.visible)
		throw new HarnessCheckError(
			`${summary} — framework '${candidateId}' is not visible to Claude Code after install; not starting the agent`,
		);
	return summary;
}
