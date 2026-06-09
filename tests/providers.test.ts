import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorktreeProvider } from "../src/providers/worktree";

const base = mkdtempSync(join(tmpdir(), "harness-eval-iso-"));
const provider = new WorktreeProvider(base);

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("worktree provider isolation (task 3.4 contamination scenarios)", () => {
	test("concurrent trials cannot see each other's claude config, skills, or npm globals", async () => {
		const [a, b] = await Promise.all([
			provider.provision("trial-a"),
			provider.provision("trial-b"),
		]);

		// Trial A "installs" a plugin, a skill, and an npm global.
		await a.exec(
			`mkdir -p "$CLAUDE_CONFIG_DIR/plugins" && echo fake > "$CLAUDE_CONFIG_DIR/plugins/superpowers.json"`,
		);
		await a.exec(
			`mkdir -p "$HOME/.claude/skills/test-skill" && echo skill > "$HOME/.claude/skills/test-skill/SKILL.md"`,
		);
		await a.exec(
			`mkdir -p "$npm_config_prefix/bin" && echo bin > "$npm_config_prefix/bin/fake-tool"`,
		);

		// Trial B sees none of it.
		const plugin = await b.exec(
			`ls "$CLAUDE_CONFIG_DIR/plugins" 2>/dev/null | wc -l`,
		);
		expect(plugin.stdout.trim()).toBe("0");
		const skills = await b.exec(
			`ls "$HOME/.claude/skills" 2>/dev/null | wc -l`,
		);
		expect(skills.stdout.trim()).toBe("0");
		const npmBin = await b.exec(
			`test -f "$npm_config_prefix/bin/fake-tool"; echo $?`,
		);
		expect(npmBin.stdout.trim()).toBe("1");

		// Neither trial's HOME is the host's HOME.
		const homeA = await a.exec(`echo "$HOME"`);
		const homeB = await b.exec(`echo "$HOME"`);
		expect(homeA.stdout.trim()).not.toBe(process.env.HOME);
		expect(homeB.stdout.trim()).not.toBe(process.env.HOME);
		expect(homeA.stdout.trim()).not.toBe(homeB.stdout.trim());

		// Workspaces are disjoint.
		await a.writeFile("artifact.txt", "from-a");
		const cross = await b.exec(`test -f artifact.txt; echo $?`);
		expect(cross.stdout.trim()).toBe("1");

		await Promise.all([a.destroy(), b.destroy()]);
	});

	test("destroy removes the trial root", async () => {
		const s = await provider.provision("trial-c");
		await s.writeFile("x.txt", "x");
		await s.destroy();
		const gone = await provider.provision("trial-c"); // fresh provision works on same id
		const seen = await gone.exec(`test -f x.txt; echo $?`);
		expect(seen.stdout.trim()).toBe("1");
		await gone.destroy();
	});
});
