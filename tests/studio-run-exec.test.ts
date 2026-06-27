import { expect, test } from "bun:test";
import { ModelProfile } from "../src/models";
import {
	stripInstallStepsForDryRun,
	studioCostSource,
} from "../src/studio/run-exec";

const local = ModelProfile.parse({
	name: "ollama-x",
	provider: "ollama",
	modelId: "qwen3-coder",
	transport: "codex",
	authKind: "none",
	ossProvider: "ollama",
});

test("non-dry local codex worker records tokens-only, not harness-reported", () => {
	expect(studioCostSource(false, local, false)).toBe("tokens-only");
});

test("dry run is always tokens-only", () => {
	expect(studioCostSource(true, local, false)).toBe("tokens-only");
});

test("dry run candidates skip framework installs without mutating live registry entries", () => {
	const candidate = {
		id: "superpowers",
		name: "Superpowers",
		repo: "https://github.com/obra/superpowers",
		pinnedVersion: "5.1.0",
		markerPaths: [],
		harnesses: {
			"claude-code": {
				install: ["claude plugin marketplace add obra/superpowers-marketplace"],
				session: [{ prompt: "{{BASE_PROMPT}}", newSession: false }],
				continuation: {
					allowlist: ["continue"],
					maxContinuations: 1,
				},
			},
		},
	};

	const dry = stripInstallStepsForDryRun([candidate], "claude-code");
	const drySetup = dry[0]!.harnesses["claude-code"]!;
	const liveSetup = candidate.harnesses["claude-code"]!;

	expect(dry).toHaveLength(1);
	expect(dry[0]!.id).toBe(candidate.id);
	expect(drySetup.install).toEqual([]);
	expect(drySetup.session).toEqual(liveSetup.session);
	expect(liveSetup.install).toEqual([
		"claude plugin marketplace add obra/superpowers-marketplace",
	]);
});
