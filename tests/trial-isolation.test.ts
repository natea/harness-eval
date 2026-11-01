import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCodeDriver } from "../src/driver/claude";
import { codexDriver } from "../src/driver/codex";
import {
	assertWebToolKillSwitch,
	hasWebToolKillSwitch,
	ToolPolicyError,
} from "../src/driver/toolpolicy";
import type { Sandbox } from "../src/providers/types";
import { WorktreeProvider } from "../src/providers/worktree";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bf-isolation-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

function fakeSandbox(): { sandbox: Sandbox; commands: string[] } {
	const commands: string[] = [];
	const result = {
		type: "result",
		session_id: "s1",
		usage: {},
		duration_ms: 1,
		num_turns: 1,
		total_cost_usd: 0.01,
		result: "done",
	};
	const sandbox: Sandbox = {
		id: "worktree:fake",
		workspacePath: "/tmp/fake-ws",
		exec: async (cmd: string) => {
			commands.push(cmd);
			const stdout = cmd.startsWith("cat ")
				? `${JSON.stringify(result)}\n`
				: "";
			return { exitCode: 0, stdout, stderr: "" };
		},
		copyOut: async () => {},
		copyIn: async () => {},
		writeFile: async () => {},
		destroy: async () => {},
	};
	return { sandbox, commands };
}

const runOptions = {
	model: "claude-opus-4-6",
	prompt: "do the task",
	stepIndex: 0,
	timeoutMs: 10_000,
};

describe("web tool kill-switch", () => {
	test("is declared for claude-code and codex, refused for others", () => {
		expect(hasWebToolKillSwitch("claude-code")).toBe(true);
		expect(hasWebToolKillSwitch("codex")).toBe(true);
		expect(hasWebToolKillSwitch("zeroclaw")).toBe(false);
		expect(() => assertWebToolKillSwitch("zeroclaw")).toThrow(ToolPolicyError);
		expect(() => assertWebToolKillSwitch("claude-code")).not.toThrow();
	});

	test("claude-code sessions disable MCP and provider web tools", async () => {
		const { sandbox, commands } = fakeSandbox();
		await claudeCodeDriver.runSession(sandbox, {
			...runOptions,
			isolated: true,
		});
		expect(commands[0]).toContain("--strict-mcp-config");
		expect(commands[0]).toContain('--disallowedTools "WebSearch" "WebFetch"');

		const plain = fakeSandbox();
		await claudeCodeDriver.runSession(plain.sandbox, runOptions);
		expect(plain.commands[0]).not.toContain("--strict-mcp-config");
		expect(plain.commands[0]).not.toContain("--disallowedTools");
	});

	test("codex sessions disable provider-side web search", async () => {
		const { sandbox, commands } = fakeSandbox();
		// The codex parser needs a terminal event; the fake returns claude JSON, so
		// only inspect the command after the parse failure is swallowed.
		await codexDriver
			.runSession(sandbox, { ...runOptions, isolated: true })
			.catch(() => {});
		expect(commands[0]).toContain("-c tools.web_search=false");
	});
});

describe("worktree trial isolation", () => {
	test("drops operator credentials and points HOME at the trial", async () => {
		const provider = new WorktreeProvider(join(root, "sandboxes"));
		const sandbox = await provider.provision("iso");
		const saved: Record<string, string | undefined> = {};
		const injected = {
			CLAUDE_CODE_OAUTH_TOKEN: "operator-oauth",
			GITHUB_TOKEN: "operator-github",
			ANTHROPIC_BASE_URL: "https://operator.example",
			HARNESS_OPERATOR_ONLY: "leak",
		};
		for (const [k, v] of Object.entries(injected)) {
			saved[k] = process.env[k];
			process.env[k] = v;
		}
		try {
			const env = await sandbox.exec("printenv");
			for (const key of Object.keys(injected))
				expect(env.stdout).not.toContain(key);
			expect(env.stdout).toContain("HOME=");
			const home = await sandbox.exec('printf "%s" "$HOME"');
			expect(home.stdout).not.toBe(process.env.HOME);
			// Fresh home: no operator Claude config, only the trial's own dirs.
			const listing = await sandbox.exec('ls -A "$HOME"');
			expect(listing.stdout.split("\n").filter(Boolean)).toEqual([
				".claude-config",
			]);

			// Explicit auth env still reaches the worker.
			const withAuth = await sandbox.exec('printf "%s" "$ANTHROPIC_API_KEY"', {
				env: { ANTHROPIC_API_KEY: "sk-ant-trial" },
			});
			expect(withAuth.stdout).toBe("sk-ant-trial");
		} finally {
			for (const [k, v] of Object.entries(saved)) {
				if (v === undefined) delete process.env[k];
				else process.env[k] = v;
			}
			await sandbox.destroy();
		}
	});
});
