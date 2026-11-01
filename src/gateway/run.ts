/**
 * Run wiring for the model gateway (add-brownfield-track D11, task 4.4).
 *
 * One gateway and one egress lock per run. For each trial, after the harness is
 * installed and before the agent starts, `enter` locks the sandbox, proves the lock
 * holds, and issues that trial its own placeholder key. `exit` revokes the key and
 * returns review flags for any request the gateway rejected.
 */

import { agentTestEnvScript } from "../brownfield/testrun";
import type { HarnessId } from "../types";
import type { Sandbox } from "../providers/types";
import { DockerEgressLock, EGRESS_LEAK_PROBES } from "../providers/egress";
import { claudeCodeGatewayEnv, type Gateway, startGateway } from "./anthropic";

export interface TrialEgress {
	/** Lock the sandbox to the gateway; returns the worker env and model flag. */
	enter(
		trialId: string,
		harness: HarnessId,
		sandbox: Sandbox,
	): Promise<{
		env: Record<string, string>;
		modelFlag: string;
		notes?: string[];
	}>;
	/** Revoke the trial's key; returns review flags. Idempotent. */
	exit(trialId: string): string[];
}

/**
 * Sourced by Claude Code before each Bash command, so only the agent's shell
 * commands get these settings, not Claude Code itself. Outside the workspace, so
 * it never reaches the captured patch.
 */
const AGENT_TEST_ENV_PATH = "/tmp/harness-eval/agent-test-env.sh";

/** Harnesses that speak the Anthropic protocol natively (no translation, D11). */
const ANTHROPIC_PROTOCOL: ReadonlySet<HarnessId> = new Set(["claude-code"]);

/** Null when the harness can use the Anthropic gateway; otherwise why not. */
export function gatewayIncompatibility(harness: HarnessId): string | null {
	return ANTHROPIC_PROTOCOL.has(harness)
		? null
		: `${harness} does not speak the Anthropic protocol; the gateway does not translate, so it can't run behind this run's gateway`;
}

/** Thrown when the lock doesn't hold; deliberately not an infra error (no retry). */
export class EgressLockError extends Error {}

export function gatewayFlags(
	gateway: Pick<Gateway, "rejections">,
	trialId: string,
): string[] {
	return [
		...new Set(
			gateway.rejections(trialId).map((e) => `gateway-rejected: ${e.reason}`),
		),
	];
}

export interface DockerGatewayEgressOptions {
	runId: string;
	/** Image with bun, used for the relay (the trial image). */
	image: string;
	model: string;
	credential: import("./credential").GatewayCredential;
	logPath: string;
	upstream?: string;
	/** Address the gateway binds; Docker Desktop for Mac reaches 127.0.0.1. */
	hostname?: string;
}

export interface RunEgress {
	egress: TrialEgress;
	gateway: Gateway;
	stop(): Promise<void>;
}

/** Start the gateway and the docker lock for one run. */
export async function startDockerGatewayEgress(
	opts: DockerGatewayEgressOptions,
): Promise<RunEgress> {
	const gateway = startGateway({
		model: opts.model,
		credential: opts.credential,
		logPath: opts.logPath,
		upstream: opts.upstream,
		hostname: opts.hostname,
	});
	const lock = new DockerEgressLock({
		runId: opts.runId,
		image: opts.image,
		gatewayPort: gateway.port,
	});
	try {
		await lock.start();
	} catch (e) {
		gateway.stop();
		throw e;
	}
	const egress: TrialEgress = {
		async enter(trialId, harness, sandbox) {
			const why = gatewayIncompatibility(harness);
			if (why) throw new EgressLockError(why);
			const [kind, container] = sandbox.id.split(":");
			if (kind !== "docker" || !container)
				throw new EgressLockError(
					`egress lock needs a docker sandbox, got ${sandbox.id}`,
				);
			await lock.attach(container);
			for (const probe of EGRESS_LEAK_PROBES) {
				const r = await sandbox.exec(probe, { timeoutMs: 30_000 });
				if (r.exitCode === 0)
					throw new EgressLockError(
						`egress lock did not hold: \`${probe}\` succeeded`,
					);
			}
			const placeholder = gateway.issue(trialId);
			await sandbox.writeFile(AGENT_TEST_ENV_PATH, agentTestEnvScript());
			const worker = claudeCodeGatewayEnv(
				opts.model,
				lock.baseUrl,
				placeholder,
			);
			return {
				...worker,
				env: { ...worker.env, CLAUDE_ENV_FILE: AGENT_TEST_ENV_PATH },
				notes: ["agent test env: offline switches (no proxy)"],
			};
		},
		exit(trialId) {
			gateway.revoke(trialId);
			return gatewayFlags(gateway, trialId);
		},
	};
	return {
		egress,
		gateway,
		async stop() {
			await lock.stop();
			gateway.stop();
		},
	};
}
