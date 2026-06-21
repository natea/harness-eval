/**
 * Studio glue for artifact-preview: resolves a trial's read-only inventory
 * (joining the run's target for the cold-start contract + web/non-web kind) and
 * owns the process-wide PreviewManager that the studio's Demo controls drive.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getRun } from "../dashboard/data";
import { loadTarget } from "../targets";
import { type ArtifactInventory, readInventory } from "./inventory";
import { PreviewManager, type PreviewRecord } from "./manager";

export interface TrialTargetInfo {
	name: string;
	/** Web/HTTP target → live demo URL; non-web → captured cold-start run. */
	web: boolean;
	coldStartContract: string[];
}

/** Resolve a run's target (by recorded PRD hash) for cold-start + kind. */
export function resolveTrialTarget(
	runId: string,
	runsDir = "runs",
): TrialTargetInfo | null {
	const sha = getRun(runId, runsDir)?.results?.prdSha256;
	if (!sha || !existsSync("targets")) return null;
	for (const dir of readdirSync("targets")) {
		if (!existsSync(join("targets", dir, "target.yaml"))) continue;
		try {
			const t = loadTarget(dir);
			if (t.prdSha256 === sha) {
				return {
					name: dir,
					web: Boolean(t.manifest.ui),
					coldStartContract: t.manifest.coldStartContract,
				};
			}
		} catch {
			// skip unloadable target
		}
	}
	return null;
}

/** Read-only artifact inventory for a trial, joined with its target's contract. */
export function trialInventory(
	runId: string,
	trialId: string,
	runsDir = "runs",
): (ArtifactInventory & { target: string | null; web: boolean }) | null {
	const entry = getRun(runId, runsDir);
	if (!entry) return null;
	const trialDir = join(entry.dir, "trials", trialId);
	if (!existsSync(trialDir)) return null;
	const target = resolveTrialTarget(runId, runsDir);
	const inv = readInventory(trialId, trialDir, target?.coldStartContract ?? []);
	return { ...inv, target: target?.name ?? null, web: target?.web ?? false };
}

/** Process-wide preview lifecycle manager (concurrency-capped, idle-stopping). */
export const previewManager = new PreviewManager({
	maxConcurrent: 3,
	idleMs: 15 * 60_000,
	log: (m) => console.log(m),
});

/** Start a demo for a trial. Sandboxed (docker) by default. */
export async function startTrialPreview(
	runId: string,
	trialId: string,
	opts: { unsafeHost?: boolean; router?: "port" | "portless" } = {},
	runsDir = "runs",
): Promise<PreviewRecord | { refused: string } | { error: string }> {
	const entry = getRun(runId, runsDir);
	if (!entry) return { error: "run not found" };
	const target = resolveTrialTarget(runId, runsDir);
	const workspaceDir = join(entry.dir, "trials", trialId, "workspace");
	if (!existsSync(workspaceDir)) return { error: "no built workspace for trial" };

	const previewId = `${runId}__${trialId}`;
	// Already running? return the existing record (idempotent open).
	const existing = previewManager.get(previewId);
	if (existing && existing.state !== "stopped" && existing.state !== "failed") {
		previewManager.touch(previewId);
		return existing;
	}

	return previewManager.start(runId, trialId, target?.name ?? "unknown", {
		previewId,
		workspaceDir,
		web: target?.web ?? false,
		unsafeHost: opts.unsafeHost,
		router: opts.router,
	});
}

export function stopTrialPreview(
	runId: string,
	trialId: string,
): Promise<{ ok: boolean }> {
	return previewManager.stop(`${runId}__${trialId}`);
}
