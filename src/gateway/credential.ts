/**
 * Which real credential a model gateway injects (add-brownfield-track D11).
 *
 * Default is the operator's Claude subscription OAuth token
 * (`CLAUDE_CODE_OAUTH_TOKEN`, operator decision 2026-11-01), so brownfield runs
 * do not bill API credits. `api-key` must be chosen explicitly. Either way the
 * sandbox only ever holds a placeholder with the matching prefix: Claude Code picks
 * its auth scheme (x-api-key vs Bearer + oauth beta) from which variable is set
 * and from the token prefix.
 */

export type CredentialKind = "oauth" | "api-key";
export interface GatewayCredential {
	kind: CredentialKind;
	token: string;
}

export const OAUTH_BETA = "oauth-2025-04-20";
const PREFIX: Record<CredentialKind, string> = {
	oauth: "sk-ant-oat01-hegw-",
	"api-key": "sk-ant-api03-hegw-",
};

/** Resolve the credential; never falls back silently to the other kind. */
export function resolveGatewayCredential(
	choice: string = "oauth",
	env: NodeJS.ProcessEnv = process.env,
): GatewayCredential {
	if (choice === "oauth") {
		const token = env.CLAUDE_CODE_OAUTH_TOKEN;
		if (!token)
			throw new Error(
				"CLAUDE_CODE_OAUTH_TOKEN is not set; brownfield runs use the Claude subscription by default (pass --credential api-key to bill API credits instead)",
			);
		return { kind: "oauth", token };
	}
	if (choice === "api-key") {
		const token = env.ANTHROPIC_API_KEY;
		if (!token) throw new Error("--credential api-key needs ANTHROPIC_API_KEY");
		return { kind: "api-key", token };
	}
	throw new Error(`unknown --credential '${choice}' (oauth | api-key)`);
}

/** Replace whatever the client sent with the real credential. */
export function injectCredential(
	headers: Headers,
	cred: GatewayCredential,
): void {
	headers.delete("authorization");
	headers.delete("x-api-key");
	if (cred.kind === "api-key") {
		headers.set("x-api-key", cred.token);
		return;
	}
	headers.set("authorization", `Bearer ${cred.token}`);
	const beta = headers.get("anthropic-beta");
	const flags = beta ? beta.split(",").map((s) => s.trim()) : [];
	if (!flags.includes(OAUTH_BETA))
		headers.set(
			"anthropic-beta",
			[...flags, OAUTH_BETA].filter(Boolean).join(","),
		);
}

/** A fresh placeholder for one trial, shaped like the real credential. */
export function newPlaceholderFor(kind: CredentialKind): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return PREFIX[kind] + Buffer.from(bytes).toString("base64url");
}

export const placeholderKind = (p: string): CredentialKind =>
	p.startsWith(PREFIX.oauth) || p.startsWith("sk-ant-oat")
		? "oauth"
		: "api-key";

/** Claude Code auth env for a sandbox holding only `placeholder`. */
export function placeholderAuthEnv(
	placeholder: string,
): Record<string, string> {
	return placeholderKind(placeholder) === "oauth"
		? {
				CLAUDE_CODE_OAUTH_TOKEN: placeholder,
				ANTHROPIC_API_KEY: "",
				ANTHROPIC_AUTH_TOKEN: "",
			}
		: {
				ANTHROPIC_API_KEY: placeholder,
				CLAUDE_CODE_OAUTH_TOKEN: "",
				ANTHROPIC_AUTH_TOKEN: "",
			};
}
