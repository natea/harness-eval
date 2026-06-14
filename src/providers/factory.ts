import { DaytonaProvider } from "./daytona";
import { createDockerProvider, DEFAULT_TRIAL_IMAGE } from "./docker";
import { E2BProvider } from "./e2b";
import { createMacosVzProvider } from "./macos-vz";
import type { ProviderId, SandboxProvider } from "./types";
import { WorktreeProvider } from "./worktree";

export interface ProviderOptions {
	/** Daytona snapshot name / E2B template / local image tag, per provider. */
	snapshot?: string;
	worktreeBaseDir?: string;
	memoryGb?: number;
	cpus?: number;
	e2bTier?: "hobby" | "pro";
}

export function createProvider(
	id: ProviderId,
	opts: ProviderOptions = {},
): SandboxProvider {
	const limits = { memoryGb: opts.memoryGb ?? 4, cpus: opts.cpus ?? 2 };
	switch (id) {
		case "daytona":
			return new DaytonaProvider(opts.snapshot ?? "harness-eval-base:v2");
		case "e2b":
			return new E2BProvider({
				template: opts.snapshot ?? "harness-eval-trial",
				tier: opts.e2bTier,
			});
		case "docker":
			return createDockerProvider(opts.snapshot ?? DEFAULT_TRIAL_IMAGE, limits);
		case "macos-vz":
			return createMacosVzProvider(
				opts.snapshot ?? DEFAULT_TRIAL_IMAGE,
				limits,
			);
		case "worktree":
			return new WorktreeProvider(opts.worktreeBaseDir ?? "runs/sandboxes");
		default: {
			const exhaustive: never = id;
			throw new Error(`unknown provider ${exhaustive}`);
		}
	}
}
