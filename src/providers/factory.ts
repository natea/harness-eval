import type { HarnessId } from "../types";
import { DaytonaProvider } from "./daytona";
import { createDockerProvider, DEFAULT_TRIAL_IMAGE } from "./docker";
import { E2BProvider } from "./e2b";
import { createMacosVzProvider } from "./macos-vz";
import type { ProviderId, SandboxProvider } from "./types";
import { WorktreeProvider } from "./worktree";

export const ZEROCLAW_DAYTONA_SNAPSHOT = "harness-eval-base:v4";
export const ZEROCLAW_TRIAL_IMAGE = DEFAULT_TRIAL_IMAGE;
export const ZEROCLAW_E2B_TEMPLATE = "harness-eval-trial";
export const ZEROCLAW_IMAGE_PROBE = {
	label: "zerocode toolchain",
	command:
		"command -v zeroclaw && zeroclaw --version && test -s /opt/zeroclaw/acp-client.ts && test -s /opt/zeroclaw/trial-config.toml",
};

export interface ProviderOptions {
	/** Daytona snapshot name / E2B template / local image tag, per provider. */
	snapshot?: string;
	worktreeBaseDir?: string;
	memoryGb?: number;
	cpus?: number;
	e2bTier?: "hobby" | "pro";
}

/**
 * The zerocode harness requires a trial image/snapshot that contains the
 * `zeroclaw` binary plus the bundled ACP client/config files. Enforce that at
 * provider selection time so stale images fail before any trial is dispatched.
 */
export function resolveProviderSnapshot(
	provider: ProviderId,
	harness: HarnessId,
	requested?: string,
): string | undefined {
	if (harness !== "zerocode") return requested;
	const required =
		provider === "daytona"
			? ZEROCLAW_DAYTONA_SNAPSHOT
			: provider === "docker" || provider === "macos-vz"
				? ZEROCLAW_TRIAL_IMAGE
				: provider === "e2b"
					? ZEROCLAW_E2B_TEMPLATE
					: undefined;
	if (provider === "worktree") {
		throw new Error(
			"zerocode requires an image-backed provider (docker, daytona, e2b, or macos-vz) so the zeroclaw binary and ACP client are present; worktree runs on the host",
		);
	}
	if (!required) return requested;
	if (requested && requested !== required) {
		throw new Error(
			`zerocode on ${provider} requires snapshot/image '${required}' because it contains zeroclaw and the ACP client; got '${requested}'`,
		);
	}
	return required;
}

export function preflightProbeForHarness(harness: HarnessId) {
	return harness === "zerocode" ? ZEROCLAW_IMAGE_PROBE : undefined;
}

export function createProvider(
	id: ProviderId,
	opts: ProviderOptions = {},
): SandboxProvider {
	const limits = { memoryGb: opts.memoryGb ?? 4, cpus: opts.cpus ?? 2 };
	switch (id) {
		case "daytona":
			return new DaytonaProvider(opts.snapshot ?? ZEROCLAW_DAYTONA_SNAPSHOT);
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
