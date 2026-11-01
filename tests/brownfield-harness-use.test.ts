import { expect, test } from "bun:test";
import { activitySummary, harnessActivity } from "../src/brownfield/activity";
import { parseHarnessCheck } from "../src/brownfield/harness-check";
import {
	needsRouting,
	routerPrompt,
	withRouting,
} from "../src/brownfield/router";
import type { CandidateEntry } from "../src/types";

const cand = (id: string, name: string, first: string) =>
	({
		id,
		name,
		harnesses: {
			"claude-code": {
				install: [],
				session: [{ prompt: first, newSession: false }],
				continuation: { allowlist: [], maxContinuations: 0 },
			},
		},
	}) as unknown as CandidateEntry;

test("routing: auto-engaging frameworks get the help-first step; own-command frameworks and bare don't", () => {
	const sp = withRouting(
		cand("superpowers", "Superpowers", "{{BASE_PROMPT}}"),
		"claude-code",
	);
	expect(sp.harnesses["claude-code"]?.session[0]?.prompt).toBe(
		`${routerPrompt("Superpowers")}\n\n{{BASE_PROMPT}}`,
	);
	expect(
		needsRouting(
			cand("gsd", "GSD", "/gsd-new-project --auto {{BASE_PROMPT}}"),
			"claude-code",
		),
	).toBe(false);
	expect(
		needsRouting(cand("bare", "Bare", "{{BASE_PROMPT}}"), "claude-code"),
	).toBe(false);
});

test("routing text is identical across frameworks apart from the name, and names no command", () => {
	const a = routerPrompt("Superpowers").replaceAll("Superpowers", "X");
	const b = routerPrompt("Agent Skills").replaceAll("Agent Skills", "X");
	expect(a).toBe(b);
	expect(a).not.toMatch(/debug|test-driven|brainstorm|\/\w/i);
});

const init = JSON.stringify({
	type: "system",
	subtype: "init",
	plugins: [
		{
			name: "superpowers",
			path: "/x",
			source: "superpowers@m",
			version: "7.0.1",
		},
		{
			name: "cc-plugin-agents-md",
			path: "builtin",
			source: "cc-plugin-agents-md@builtin",
		},
	],
	skills: [
		"superpowers:test-driven-development",
		"superpowers:systematic-debugging",
		"other:thing",
	],
});
const tool = (name: string, input: object) =>
	JSON.stringify({
		type: "assistant",
		message: { content: [{ type: "tool_use", name, input }] },
	});

test("activity: loaded but unused is NOT engaged; a Skill call or a framework command is", () => {
	const idle = harnessActivity([
		[init, tool("Read", {}), tool("Edit", {})].join("\n"),
	]);
	expect(idle.engaged).toBe(false);
	expect(idle.plugins).toEqual([{ name: "superpowers", version: "7.0.1" }]);
	expect(idle.available).toEqual([
		"superpowers:test-driven-development",
		"superpowers:systematic-debugging",
	]);
	expect(activitySummary(idle)).toMatch(
		/^NOT engaged: superpowers 7\.0\.1 loaded/,
	);
	const used = harnessActivity([
		[
			init,
			tool("Skill", { skill: "superpowers:test-driven-development" }),
		].join("\n"),
	]);
	expect(used.engaged).toBe(true);
	expect(activitySummary(used)).toBe(
		"engaged: superpowers:test-driven-development",
	);
	// Scripted commands alone prove nothing: GSD's model ignored them and fixed the bug.
	const prompts = ["/gsd-new-project --auto do it", "/gsd-plan-phase"];
	const scripted = harnessActivity([""], prompts);
	expect(scripted.engaged).toBe(false);
	expect(activitySummary(scripted)).toMatch(
		/^NOT engaged: scripted \/gsd-new-project/,
	);
	const consulted = harnessActivity(
		[
			tool("Read", {
				file_path: "/home/u/.claude/gsd-core/workflows/plan-phase.md",
			}),
		],
		prompts,
	);
	expect(consulted.engaged).toBe(false);
	expect(consulted.frameworkReads).toBe(1);
	const delegated = harnessActivity(
		[tool("Agent", { subagent_type: "gsd-planner" })],
		prompts,
	);
	expect(delegated.engaged).toBe(true);
	const plain = harnessActivity(
		[tool("Agent", { subagent_type: "general-purpose" })],
		prompts,
	);
	expect(plain.engaged).toBe(false);
	const wrote = harnessActivity(
		[tool("Write", { file_path: "/w/.planning/PROJECT.md" })],
		prompts,
		[".planning/"],
	);
	expect(wrote.engaged).toBe(true);
	expect(scripted.commandsInvoked).toEqual([
		"gsd-new-project",
		"gsd-plan-phase",
	]);
	expect(activitySummary(harnessActivity([tool("Bash", {})], ["fix it"]))).toBe(
		"no framework (plain Claude Code)",
	);
	// A built-in skill isn't the framework's.
	expect(
		harnessActivity([tool("Skill", { skill: "code-review" })], ["/ce-plan x"])
			.engaged,
	).toBe(false);
});

test("harness check parses claude plugin list and skill dirs", () => {
	const c = parseHarnessCheck(
		"## plugins\nInstalled plugins:\n\n  ❯ superpowers@superpowers-marketplace\n    Version: 7.0.1\n    Scope: user\n    Status: ✔ enabled\n## dirs\n",
	);
	expect(c.plugins).toEqual([
		{
			name: "superpowers@superpowers-marketplace",
			version: "7.0.1",
			enabled: true,
		},
	]);
	expect(c.visible).toBe(true);
	expect(
		parseHarnessCheck("## plugins\nNo plugins installed\n## dirs\n").visible,
	).toBe(false);
	expect(
		parseHarnessCheck(
			"## plugins\n## dirs\n/home/u/.claude/commands: gsd-plan.md\n",
		).visible,
	).toBe(true);
});
