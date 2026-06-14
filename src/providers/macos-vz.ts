import { arch, platform } from "node:os";
import {
	CliContainerProvider,
	cli,
	type ResourceLimits,
} from "./cli-container";
import { DEFAULT_TRIAL_IMAGE } from "./docker";
import { PreflightError } from "./types";

/** Minimum Apple Containerization CLI version (macos-vz change D3). */
export const MIN_CONTAINER_CLI = "0.5.0";

function versionGte(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const da = pa[i] ?? 0;
		const db = pb[i] ?? 0;
		if (da !== db) return da > db;
	}
	return true;
}

/**
 * macOS virtualization provider (Apple Silicon): per-trial lightweight Linux
 * VMs via Apple's Containerization `container` CLI over
 * Virtualization.framework. Shares the verb table with Docker.
 */
export function createMacosVzProvider(
	image: string = DEFAULT_TRIAL_IMAGE,
	limits: ResourceLimits = { memoryGb: 4, cpus: 2 },
): CliContainerProvider {
	return new CliContainerProvider(
		{
			providerId: "macos-vz",
			binary: "container",
			runArgs: (l) => ["--memory", `${l.memoryGb}g`, "--cpus", String(l.cpus)],
			infoArgs: ["system", "status"],
			execCopy: true, // Apple container CLI (0.7.x) has no cp verb
			platformCheck: async () => {
				if (platform() !== "darwin" || arch() !== "arm64") {
					throw new PreflightError(
						`macos-vz requires Apple Silicon macOS (host is ${platform()}/${arch()})`,
					);
				}
				const v = await cli("container", ["--version"], { timeoutMs: 10_000 });
				if (v.exitCode !== 0) {
					throw new PreflightError(
						"Apple `container` CLI not found — install via `brew install container` (or Apple's installer) and run `container system start`",
					);
				}
				const version = v.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] ?? "0.0.0";
				if (!versionGte(version, MIN_CONTAINER_CLI)) {
					throw new PreflightError(
						`container CLI ${version} < required ${MIN_CONTAINER_CLI} — upgrade before running trials`,
					);
				}
			},
		},
		image,
		limits,
	);
}
