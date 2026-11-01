/**
 * Brownfield trials on Docker (task 4.4 lockdown + 4.1): each trial runs in its
 * task's prebuilt image (`brownfield image`), so seeding only checks the sealed
 * state and writes the issue. Network lockdown and the model gateway come from
 * `startDockerGatewayEgress`, applied by the scheduler's egress step.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrownfieldTrialTask } from "../orchestrator/scheduler";
import type { Sandbox } from "../providers/types";
import type { Bundle } from "./bundle";
import { ISSUE_ASSETS_DIR, TRIAL_BRANCH } from "./workspace";

/** Write bytes into a sandbox through exec (works for binary files). */
async function writeBytes(
	sandbox: Sandbox,
	path: string,
	bytes: Buffer,
): Promise<void> {
	const b64 = bytes.toString("base64");
	const q = JSON.stringify(path);
	await sandbox.exec(
		`mkdir -p ${JSON.stringify(dirname(path))} && : > ${q}.b64`,
	);
	for (let i = 0; i < b64.length; i += 65536) {
		const r = await sandbox.exec(
			`printf %s ${JSON.stringify(b64.slice(i, i + 65536))} >> ${q}.b64`,
		);
		if (r.exitCode !== 0)
			throw new Error(`write ${path} failed: ${r.stderr.slice(0, 200)}`);
	}
	const r = await sandbox.exec(`base64 -d ${q}.b64 > ${q} && rm ${q}.b64`);
	if (r.exitCode !== 0)
		throw new Error(`write ${path} failed: ${r.stderr.slice(0, 200)}`);
}

/** The image's workspace must be exactly the sealed base before the agent arrives. */
export async function checkSealedWorkspace(
	sandbox: Sandbox,
	baseSha: string,
): Promise<void> {
	const r = await sandbox.exec(
		"git rev-parse HEAD && git branch --show-current && git status --porcelain",
	);
	const [head, branch, ...dirty] = r.stdout.trim().split("\n");
	if (r.exitCode !== 0 || head !== baseSha || branch !== TRIAL_BRANCH)
		throw new Error(
			`task image workspace is not the sealed base: HEAD ${head} on ${branch} (want ${baseSha} on ${TRIAL_BRANCH})`,
		);
	if (dirty.some((l) => l.trim()))
		throw new Error(`task image workspace is dirty:\n${dirty.join("\n")}`);
}

/**
 * Seed a docker trial: verify the sealed state, write the issue file and its
 * bundled images (links rewritten to sit beside the issue), and git-exclude both
 * so they never appear in the captured patch.
 */
export async function seedDockerTrial(
	sandbox: Sandbox,
	task: BrownfieldTrialTask,
	bundle: Bundle,
): Promise<void> {
	await checkSealedWorkspace(sandbox, task.baseSha);
	const assetsDir = join(bundle.dir, "issue", "assets");
	const assets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
	await sandbox.writeFile(
		join(sandbox.workspacePath, task.issueFile),
		task.issueContent.replaceAll("](assets/", `](${ISSUE_ASSETS_DIR}/`),
	);
	for (const name of assets)
		await writeBytes(
			sandbox,
			join(sandbox.workspacePath, ISSUE_ASSETS_DIR, name),
			readFileSync(join(assetsDir, name)),
		);
	// ISSUE.md is left out of the patch by the capture's own pathspec, and git
	// refuses a pathspec that names an ignored file, so only the assets dir is
	// git-excluded here.
	const ex = await sandbox.exec(
		`printf '%s\\n' '/${ISSUE_ASSETS_DIR}/' >> .git/info/exclude && git status --porcelain`,
	);
	const unexpected = ex.stdout
		.split("\n")
		.filter((l) => l.trim() && l.trim() !== `?? ${task.issueFile}`);
	if (ex.exitCode !== 0 || unexpected.length)
		throw new Error(
			`workspace has unexpected changes after seeding:\n${unexpected.join("\n")}`,
		);
}
