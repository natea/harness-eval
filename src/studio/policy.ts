/**
 * Launch authorization seam (eval-studio: "Launch authorization seam").
 *
 * Every *real* studio run passes through `canLaunch` before any sandbox is
 * provisioned. The active policy is resolved in ONE place (`resolveLaunchPolicy`)
 * so a later change (`add-eval-credits`) can substitute a balance-checking policy
 * — debit on `onLaunched`, refund on infra-failure in `onSettled` — without
 * touching the launch path.
 *
 * The default policy is intentionally minimal: a single local operator, with an
 * OPTIONAL operator token. It is NOT an identity or billing system.
 */
import type { StudioRunRequest } from "./options";

/** Who is launching. Opaque + minimal so accounts can back it later. */
export interface Principal {
	id: string;
	/** Bearer token presented with the request, if any. */
	token?: string;
}

export type LaunchDecision = { ok: true } | { ok: false; reason: string };

/** Terminal outcome of a run, handed to `onSettled` for reconciliation. */
export interface RunOutcome {
	status: "completed" | "error" | "cancelled";
	costUsd: number;
	/** True when no trial produced a billable build (e.g. all infra-failed). */
	noBillableWork: boolean;
}

export interface LaunchPolicy {
	/** Authorize (or refuse) a real launch before any spend. */
	canLaunch(
		principal: Principal,
		req: StudioRunRequest,
	): Promise<LaunchDecision>;
	/** Called once a real run has been authorized + started (e.g. debit credits). */
	onLaunched?(
		principal: Principal,
		runId: string,
		req: StudioRunRequest,
	): Promise<void>;
	/** Called when a run settles (e.g. refund on infra-failure). */
	onSettled?(
		principal: Principal,
		runId: string,
		outcome: RunOutcome,
	): Promise<void>;
}

/**
 * Default policy: authorize a single local operator. When `STUDIO_OPERATOR_TOKEN`
 * is set, the request MUST carry the matching token; otherwise any localhost
 * caller is the operator. No identity beyond "the operator", no billing.
 */
export function operatorPolicy(operatorToken?: string): LaunchPolicy {
	return {
		async canLaunch(principal) {
			if (operatorToken) {
				if (!principal.token)
					return {
						ok: false,
						reason:
							"operator token required — set the studio operator token to launch real runs",
					};
				if (principal.token !== operatorToken)
					return { ok: false, reason: "invalid operator token" };
			}
			return { ok: true };
		},
	};
}

/** The single source of truth for the active policy (swap point for billing). */
export function resolveLaunchPolicy(
	env: Record<string, string | undefined> = process.env,
): LaunchPolicy {
	return operatorPolicy(env.STUDIO_OPERATOR_TOKEN || undefined);
}

/** The local operator principal for a request (token lifted from the request). */
export function operatorPrincipal(token?: string): Principal {
	return { id: "operator", token };
}
