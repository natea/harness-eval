import { expect, test } from "bun:test";
import {
	injectCredential,
	newPlaceholderFor,
	OAUTH_BETA,
	placeholderAuthEnv,
	resolveGatewayCredential,
} from "../src/gateway/credential";

test("default is the subscription OAuth token, with no silent fallback to the API key", () => {
	expect(
		resolveGatewayCredential(undefined, {
			CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-x",
			ANTHROPIC_API_KEY: "sk-ant-api03-y",
		}),
	).toEqual({ kind: "oauth", token: "sk-ant-oat01-x" });
	expect(() =>
		resolveGatewayCredential("oauth", { ANTHROPIC_API_KEY: "sk-ant-api03-y" }),
	).toThrow(/CLAUDE_CODE_OAUTH_TOKEN is not set/);
	expect(
		resolveGatewayCredential("api-key", { ANTHROPIC_API_KEY: "k" }).kind,
	).toBe("api-key");
	expect(() => resolveGatewayCredential("nope", {})).toThrow(
		/unknown --credential/,
	);
});

test("OAuth injection: Bearer + oauth beta, client credentials removed", () => {
	const h = new Headers({
		"x-api-key": "placeholder",
		authorization: "Bearer placeholder",
		"anthropic-beta": "foo",
	});
	injectCredential(h, { kind: "oauth", token: "REAL" });
	expect(h.get("x-api-key")).toBeNull();
	expect(h.get("authorization")).toBe("Bearer REAL");
	expect(h.get("anthropic-beta")).toBe(`foo,${OAUTH_BETA}`);
	const k = new Headers({ authorization: "Bearer placeholder" });
	injectCredential(k, { kind: "api-key", token: "KEY" });
	expect(k.get("authorization")).toBeNull();
	expect(k.get("x-api-key")).toBe("KEY");
});

test("sandbox env holds only a placeholder shaped like the real credential", () => {
	const o = placeholderAuthEnv(newPlaceholderFor("oauth"));
	expect(o.CLAUDE_CODE_OAUTH_TOKEN?.startsWith("sk-ant-oat01-")).toBe(true);
	expect(o.ANTHROPIC_API_KEY).toBe("");
	const a = placeholderAuthEnv(newPlaceholderFor("api-key"));
	expect(a.ANTHROPIC_API_KEY?.startsWith("sk-ant-api03-")).toBe(true);
	expect(a.CLAUDE_CODE_OAUTH_TOKEN).toBe("");
});
