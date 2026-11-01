/**
 * `run --brownfield --provider docker` setup (tasks 4.1 + 4.4).
 *
 * 1. Build or reuse each task's image (sealed repo + env, `brownfield image`).
 * 2. Start the run-owned gateway and the docker egress lock (one per run).
 * 3. Preflight: one tiny request per candidate through the gateway, before dispatch.
 * The scheduler then provisions each trial on its task's image, seeds only the
 * issue, and runs the egress step (lock, leak probes, per-trial key) before the
 * agent starts.
 */

import { join } from "node:path";
import { archiveTrial } from "../driver/archive";
import { claudeCodeGatewayEnv } from "../gateway/anthropic";
import { resolveGatewayCredential } from "../gateway/credential";
import {
	gatewayIncompatibility,
	type RunEgress,
	gatewayBindAddress,
	startDockerGatewayEgress,
	type TrialEgress,
} from "../gateway/run";
import type { BrownfieldTrialTask, TrialPlan } from "../orchestrator/scheduler";
import { createDockerProvider, DEFAULT_TRIAL_IMAGE } from "../providers/docker";
import type { Sandbox, SandboxProvider } from "../providers/types";
import type { HarnessId } from "../types";
import type { Bundle } from "./bundle";
import { seedDockerTrial } from "./docker-trial";
import { buildTaskImage } from "./image";

export interface DockerBrownfieldOptions {
	bundles: Bundle[];
	clone: string;
	runId: string;
	runDir: string;
	harness: HarnessId;
	model: string;
	baseImage?: string;
	/** Real credential the gateway injects (default: subscription OAuth). */
	credential?: string;
	/** Preflight through the gateway (throws to abort before dispatch). */
	probe: (env: Record<string, string>, modelFlag: string) => Promise<void>;
	log?: (m: string) => void;
}

export interface DockerBrownfield {
	providerFor: (plan: TrialPlan) => SandboxProvider;
	egress: TrialEgress;
	seed: (
		sandbox: Sandbox,
		task: BrownfieldTrialTask,
		bundle: Bundle,
	) => Promise<void>;
	/** Transcripts only: the container workspace holds a multi-GB env. */
	archive: (
		sandbox: Sandbox,
		trialDir: string,
		transcripts: string[],
	) => Promise<unknown>;
	images: Map<string, string>;
	stop(): Promise<void>;
}

export async function startDockerBrownfield(
	opts: DockerBrownfieldOptions,
): Promise<DockerBrownfield> {
	const log = opts.log ?? (() => {});
	const why = gatewayIncompatibility(opts.harness);
	if (why) throw new Error(why);
	const credential = resolveGatewayCredential(opts.credential ?? "oauth");
	log(
		`gateway credential: ${credential.kind === "oauth" ? "Claude subscription (OAuth)" : "API key (bills API credits)"}`,
	);
	const baseImage = opts.baseImage ?? DEFAULT_TRIAL_IMAGE;

	const images = new Map<string, string>();
	for (const b of opts.bundles) {
		const img = await buildTaskImage(b, {
			clone: opts.clone,
			baseImage,
			log: (m) => log(`  image ${b.id}: ${m}`),
		});
		images.set(b.id, img.image);
		log(
			`task image ${b.id}: ${img.image}${img.cached ? " (cached)" : ` (built in ${img.seconds}s)`}`,
		);
	}

	const bridge =
		await Bun.$`docker network inspect bridge --format ${"{{(index .IPAM.Config 0).Gateway}}"}`
			.text()
			.then((t) => t.trim());
	const run: RunEgress = await startDockerGatewayEgress({
		hostname: gatewayBindAddress(process.platform, bridge),
		runId: opts.runId,
		image: baseImage,
		model: opts.model,
		credential,
		logPath: join(opts.runDir, "gateway.jsonl"),
	});
	try {
		const key = run.gateway.issue("preflight");
		const { env, modelFlag } = claudeCodeGatewayEnv(
			opts.model,
			run.gateway.url,
			key,
		);
		await opts.probe(env, modelFlag);
		run.gateway.revoke("preflight");
	} catch (e) {
		await run.stop();
		throw e;
	}
	log(
		`docker lockdown: trials on per-task images, egress only via relay → gateway (model ${opts.model})`,
	);

	const providers = new Map<string, SandboxProvider>();
	return {
		images,
		egress: run.egress,
		providerFor(plan) {
			const id = plan.task?.taskId;
			const image = id ? images.get(id) : undefined;
			if (!image) throw new Error(`no task image for trial ${plan.trialId}`);
			let p = providers.get(image);
			if (!p) providers.set(image, (p = createDockerProvider(image)));
			return p;
		},
		seed: seedDockerTrial,
		archive: (sandbox, trialDir, transcripts) =>
			archiveTrial(sandbox, trialDir, transcripts, { workspace: false }),
		stop: () => run.stop(),
	};
}
