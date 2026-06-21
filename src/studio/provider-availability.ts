import { IsolationProviderId } from "../types";

/**
 * Sandbox providers that need a credential to be usable. Local providers
 * (docker/macos-vz/worktree) need none. A provider whose required env var is
 * unset is surfaced as unconfigured in the studio so it can be greyed out, and
 * is rejected at launch validation.
 */
const PROVIDER_ENV: Record<string, string> = {
	daytona: "DAYTONA_API_KEY",
	e2b: "E2B_API_KEY",
};

export interface ProviderStatus {
	id: string;
	/** The env var this provider needs, if any. */
	requires?: string;
	/** True when no credential is required, or the required one is set. */
	configured: boolean;
}

/** Configuration status for every sandbox provider (eval-studio Configure view). */
export function providerAvailability(
	env: Record<string, string | undefined> = process.env,
): ProviderStatus[] {
	return IsolationProviderId.options.map((id) => {
		const requires = PROVIDER_ENV[id];
		return {
			id,
			requires,
			configured: !requires || Boolean(env[requires]?.trim()),
		};
	});
}

/** The missing-credential reason for a provider, or null if it's usable. */
export function providerUnavailableReason(
	id: string,
	env: Record<string, string | undefined> = process.env,
): string | null {
	const status = providerAvailability(env).find((p) => p.id === id);
	if (!status || status.configured) return null;
	return `provider '${id}' is not configured — set ${status.requires}`;
}
