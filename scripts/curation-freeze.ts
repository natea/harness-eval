import { writeFileSync, readdirSync } from "node:fs";
import { sha256 } from "../src/brownfield/bundle";
import { ruleHash } from "../src/brownfield/curation/quorum";
import { loadPrompt, CURATION_MODEL } from "../src/brownfield/curation/invoke";
import { LEAK_SYSTEM_PROMPT, LEAK_SCHEMA } from "../src/brownfield/classify";
const root = "brownfield/Future-House__paper-qa/curation";
const tasks = readdirSync(root).filter((t) => !t.endsWith(".json") && !t.endsWith(".md")).sort();
const names = ["issue-reader", "gold-comparer", "test-auditor", "history-agent", "round2", "single", "controller"];
const freeze = {
	frozenAt: new Date().toISOString(),
	note: "Frozen before any arm output was compared with human labels (task 4.1). Cap = 4x single-arm median spend (D8).",
	model: CURATION_MODEL,
	singleMedianUsd: 0.0585,
	capUsd: 0.234,
	quorumRuleHash: ruleHash(),
	d9PromptHash: sha256(LEAK_SYSTEM_PROMPT + JSON.stringify(LEAK_SCHEMA)),
	promptHashes: Object.fromEntries(names.map((n) => [n, loadPrompt(n).hash])),
	tasks,
};
writeFileSync(`${root}/freeze.json`, JSON.stringify(freeze, null, 2) + "\n");
console.log(freeze);
