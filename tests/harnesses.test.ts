import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	HarnessError,
	type HarnessRegistry,
	loadHarnesses,
	resolveHarness,
} from "../src/harnesses";
import { loadRegistry, resolveCandidates } from "../src/registry";

const tmp = mkdtempSync(join(tmpdir(), "he-harnesses-"));

function write(name: string, body: string): string {
	const path = join(tmp, name);
	writeFileSync(path, body);
	return path;
}

function registry(ids: string[]): HarnessRegistry {
	return new Map(
		ids.map((id) => [
			id,
			{
				id,
				name: id,
				driver: "claude-code" as const,
				defaultVersion: "test",
				reportsCost: true,
			},
		]),
	);
}

const candidateYaml = (harness: string) => `basePrompt: x
candidates:
  - id: foo
    name: Foo
    repo: https://example.com/foo
    pinnedVersion: 1.0.0
    harnesses:
      ${harness}:
        install: ["true"]
        session:
          - prompt: "{{BASE_PROMPT}}"
`;

describe("harness registry", () => {
	test("shipped harness registry preserves Claude Code defaults", () => {
		const harnesses = loadHarnesses();
		const claude = resolveHarness("claude-code", harnesses);
		expect(claude.driver).toBe("claude-code");
		expect(claude.defaultVersion).toBe("2.1.170");
	});

	test("rejects duplicate harness ids", () => {
		const path = write(
			"duplicate-harnesses.yaml",
			`harnesses:
  - id: claude-code
    name: Claude Code
    driver: claude-code
    defaultVersion: "1"
  - id: claude-code
    name: Claude Code again
    driver: claude-code
    defaultVersion: "2"
`,
		);
		expect(() => loadHarnesses(path)).toThrow(/duplicate harness id/);
	});

	test("rejects invalid harness ids and unsupported drivers", () => {
		const badId = write(
			"bad-harness-id.yaml",
			`harnesses:
  - id: OpenCode
    name: OpenCode
    driver: claude-code
    defaultVersion: 1
`,
		);
		expect(() => loadHarnesses(badId)).toThrow(HarnessError);

		const badDriver = write(
			"bad-harness-driver.yaml",
			`harnesses:
  - id: opencode
    name: OpenCode
    driver: opencode
    defaultVersion: 1
`,
		);
		expect(() => loadHarnesses(badDriver)).toThrow(HarnessError);
	});

	test("rejects candidate harness sections absent from the harness registry", () => {
		const path = write(
			"unknown-candidate-harness.yaml",
			candidateYaml("opencode"),
		);
		expect(() => loadRegistry(path, registry(["claude-code"]))).toThrow(
			/invalid harness section 'harnesses\.opencode'.*unknown harness 'opencode'/,
		);
	});

	test("rejects an unknown selected harness before candidate support checks", () => {
		const path = write(
			"known-candidate-harness.yaml",
			candidateYaml("claude-code"),
		);
		const harnesses = registry(["claude-code"]);
		const candidates = loadRegistry(path, harnesses);
		expect(() =>
			resolveCandidates(candidates, ["foo"], "opencode", harnesses),
		).toThrow(/unknown harness 'opencode'/);
	});

	test("registered harness without candidate support names the missing section", () => {
		const path = write(
			"registered-missing-section.yaml",
			candidateYaml("claude-code"),
		);
		const harnesses = registry(["claude-code", "opencode"]);
		const candidates = loadRegistry(path, harnesses);
		expect(() =>
			resolveCandidates(candidates, ["foo"], "opencode", harnesses),
		).toThrow(/candidate 'foo' has no 'opencode' harness section/);
	});
});
