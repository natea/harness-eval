/**
 * Run one curation arm over brownfield bundles (add-task-curation-collective 3.1, 4.2).
 *
 *   bun scripts/curate.ts --arm single|collective|controller [--tasks a,b|labeled] [--cap 0.5] [--concurrency 4]
 *
 * Pilot outputs go to brownfield/<repo>/curation/<task>/<arm>/ — outside the bundle
 * directories, so bundle hash verification (and runs in flight) are unaffected.
 * Freezing outputs into bundles is task 2.5.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { LABELS_FILE, listBundleDirs } from "../src/brownfield/bundle";
import { runCollective, runController, runSingle } from "../src/brownfield/curation/arms";
import { cloneFor, loadTaskCtx } from "../src/brownfield/curation/evidence";
import { pool } from "../src/brownfield/curation/invoke";
import { ARMS, type Arm } from "../src/brownfield/curation/schema";

const { values } = parseArgs({
	options: {
		arm: { type: "string" },
		tasks: { type: "string", default: "labeled" },
		repo: { type: "string", default: "Future-House__paper-qa" },
		cap: { type: "string", default: "1" },
		concurrency: { type: "string", default: "4" },
		force: { type: "boolean", default: false },
	},
});
const arm = values.arm as Arm;
if (!ARMS.includes(arm)) throw new Error(`--arm must be one of ${ARMS.join(", ")}`);
const cap = Number(values.cap);

const dirs = listBundleDirs()
	.filter((d) => d.includes(`/${values.repo}/`))
	.filter((d) =>
		values.tasks === "labeled"
			? existsSync(join(d, LABELS_FILE))
			: (values.tasks as string).split(",").some((t) => d.endsWith(`/${t}`)),
	);
console.log(`${arm}: ${dirs.length} bundles, cap $${cap}`);

let total = 0;
await pool(dirs, Number(values.concurrency), async (dir) => {
	const task = dir.split("/").at(-1) as string;
	const outDir = join(dirname(dirname(dir)), "curation", task, arm);
	if (!values.force && existsSync(join(outDir, "labels.json"))) {
		console.log(`  ${task}: exists, skipping`);
		return;
	}
	const t0 = Date.now();
	const ctx = await loadTaskCtx(dir, cloneFor(values.repo.replace("__", "/")));
	const res =
		arm === "single"
			? { output: await runSingle(ctx, cap), record: [] }
			: arm === "collective"
				? await runCollective(ctx, cap)
				: await runController(ctx, cap);
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, "labels.json"), `${JSON.stringify(res.output, null, 2)}\n`);
	if (res.record.length)
		writeFileSync(join(outDir, "record.jsonl"), res.record.map((r) => JSON.stringify(r)).join("\n") + "\n");
	if ("issueReader" in res && res.issueReader)
		writeFileSync(join(outDir, "issue-reader.json"), `${JSON.stringify(res.issueReader, null, 2)}\n`);
	total += res.output.spendUsd;
	console.log(
		`  ${task}: $${res.output.spendUsd.toFixed(3)} ${res.output.overBudget ? "OVER-BUDGET " : ""}${res.output.failed ? "FAILED " : ""}${((Date.now() - t0) / 1000).toFixed(0)}s  ${res.output.items.map((i) => `${i.id}=${i.label}`).join(" ")}`,
	);
});
console.log(`${arm}: total $${total.toFixed(2)}`);
