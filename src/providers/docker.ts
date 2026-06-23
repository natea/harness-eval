import { CliContainerProvider, type ResourceLimits } from "./cli-container";

export const DEFAULT_TRIAL_IMAGE = "harness-eval-trial:zerocode";

/** Local Docker provider (docker change D1/D2): per-trial containers. */
export function createDockerProvider(
	image: string = DEFAULT_TRIAL_IMAGE,
	limits: ResourceLimits = { memoryGb: 4, cpus: 2 },
): CliContainerProvider {
	return new CliContainerProvider(
		{
			providerId: "docker",
			binary: "docker",
			runArgs: (l) => [`--memory=${l.memoryGb}g`, `--cpus=${l.cpus}`],
		},
		image,
		limits,
	);
}
