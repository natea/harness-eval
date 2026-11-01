/**
 * Harness activity: did the trial actually use the framework, or did the model
 * fall back to plain Claude Code? Read from the archived stream-json session
 * transcripts (init event, hook events, tool calls) plus the rendered session
 * script. Works for any Claude Code trial, brownfield or not.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface HarnessActivity {
	/** Non-builtin plugins loaded in the session (the framework). */
	plugins: { name: string; version: string | null }[];
	/** Framework skills / slash commands available in the session. */
	available: string[];
	/** A SessionStart hook injected context (e.g. Superpowers' gatekeeper). */
	hookInjected: boolean;
	/** Framework skills the model invoked via the Skill tool. */
	skillCalls: string[];
	/** Framework slash commands the session script invoked. */
	commandsInvoked: string[];
	/** Subagent launches (Task / Agent tool). */
	subagents: number;
	/** Tool calls by name. */
	toolCounts: Record<string, number>;
	/** True when any framework skill or command was actually used. */
	engaged: boolean;
	/** True when there was no framework to use (e.g. `bare`). */
	noFramework: boolean;
}

type Event = Record<string, any>;

function parseLines(text: string): Event[] {
	const out: Event[] = [];
	for (const l of text.split("\n")) {
		if (!l.trim().startsWith("{")) continue;
		try {
			out.push(JSON.parse(l));
		} catch {}
	}
	return out;
}

/**
 * @param sessions raw stream-json transcripts (one string per session)
 * @param scriptPrompts the rendered session-script prompts (to see `/command` steps)
 */
export function harnessActivity(
	sessions: string[],
	scriptPrompts: string[] = [],
): HarnessActivity {
	const plugins = new Map<string, string | null>();
	const available = new Set<string>();
	const skillCalls: string[] = [];
	const toolCounts: Record<string, number> = {};
	let hookInjected = false;
	let subagents = 0;
	for (const text of sessions) {
		for (const e of parseLines(text)) {
			if (e.type === "system" && e.subtype === "init") {
				for (const p of e.plugins ?? [])
					if (
						p.path !== "builtin" &&
						!String(p.source ?? "").endsWith("@builtin")
					)
						plugins.set(p.name, p.version ?? null);
				for (const s of [...(e.skills ?? []), ...(e.slash_commands ?? [])])
					if (typeof s === "string" && s.includes(":")) available.add(s);
			}
			if (e.type === "system" && e.subtype === "hook_response") {
				const out = String(e.output ?? e.stdout ?? "");
				if (/additionalContext/.test(out)) hookInjected = true;
			}
			if (e.type === "assistant")
				for (const c of e.message?.content ?? []) {
					if (c.type !== "tool_use") continue;
					toolCounts[c.name] = (toolCounts[c.name] ?? 0) + 1;
					if (c.name === "Skill")
						skillCalls.push(String(c.input?.skill ?? c.input?.command ?? "?"));
					if (c.name === "Task" || c.name === "Agent") subagents++;
				}
		}
	}
	// Framework skills are namespaced by plugin ("superpowers:tdd"); keep those.
	const ns = [...plugins.keys()];
	const frameworkAvailable = [...available].filter((s) =>
		ns.some((n) => s.startsWith(`${n}:`)),
	);
	const commandsInvoked = scriptPrompts
		.map((p) => /^\s*[/$]([\w:.-]+)/.exec(p)?.[1])
		.filter((c): c is string => Boolean(c));
	const noFramework = plugins.size === 0 && commandsInvoked.length === 0;
	return {
		plugins: [...plugins].map(([name, version]) => ({ name, version })),
		available: frameworkAvailable,
		hookInjected,
		skillCalls,
		commandsInvoked,
		subagents,
		toolCounts,
		engaged: skillCalls.length > 0 || commandsInvoked.length > 0,
		noFramework,
	};
}

/** One-line summary for tables and reports. */
export function activitySummary(a: HarnessActivity): string {
	if (a.noFramework) return "no framework (plain Claude Code)";
	const used = [
		...new Set([...a.commandsInvoked.map((c) => `/${c}`), ...a.skillCalls]),
	];
	return a.engaged
		? `engaged: ${used.join(", ")}${a.subagents ? ` · ${a.subagents} subagent(s)` : ""}`
		: `NOT engaged: ${a.plugins.map((p) => `${p.name}${p.version ? ` ${p.version}` : ""}`).join(", ")} loaded (${a.available.length} skills/commands available${a.hookInjected ? ", startup hook fired" : ""}) but none used`;
}

/** Read a trial's archived transcripts and compute its activity. */
export function trialActivity(
	trialDir: string,
	scriptPrompts: string[],
): HarnessActivity | null {
	const dir = join(trialDir, "transcripts");
	if (!existsSync(dir)) return null;
	const sessions = readdirSync(dir)
		.filter((f) => /^session-\d+\.jsonl$/.test(f))
		.sort()
		.map((f) => readFileSync(join(dir, f), "utf8"));
	return sessions.length ? harnessActivity(sessions, scriptPrompts) : null;
}
