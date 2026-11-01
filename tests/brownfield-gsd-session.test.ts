import { expect, test } from "bun:test";
import { needsRouting, withBrownfieldSession } from "../src/brownfield/router";
import { loadRegistry } from "../src/registry";

const gsd = () => {
	const c = loadRegistry("config/registry.yaml").candidates.find(
		(x) => x.id === "gsd",
	);
	if (!c) throw new Error("gsd missing");
	return c;
};

test("GSD uses quick mode on brownfield, unchanged on greenfield, and carries the base prompt", () => {
	const brownfield = withBrownfieldSession(gsd(), "claude-code");
	const steps = brownfield.harnesses["claude-code"]?.session.map(
		(s) => s.prompt,
	);
	expect(steps).toEqual([
		"/gsd-new-project --auto @ISSUE.md",
		"/gsd-quick {{BASE_PROMPT}}",
	]);
	expect(needsRouting(brownfield, "claude-code")).toBe(false);
	expect(gsd().harnesses["claude-code"]?.session[0]?.prompt).toStartWith(
		"/gsd-new-project --auto {{BASE_PROMPT}}",
	);
	expect(gsd().harnesses.codex?.brownfieldSession).toBeUndefined();
});

test("candidates with no brownfield session are returned as they are", () => {
	const c = loadRegistry("config/registry.yaml").candidates.find(
		(x) => x.id === "superpowers",
	);
	if (!c) throw new Error("superpowers missing");
	expect(withBrownfieldSession(c, "claude-code")).toBe(c);
});
