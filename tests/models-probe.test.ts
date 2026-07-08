import { expect, test } from "bun:test";
import { ModelProfile } from "../src/models";
import { probeLocalEndpoint } from "../src/models-probe";

const ollama = ModelProfile.parse({
	name: "ollama-x",
	provider: "ollama",
	modelId: "qwen3-coder",
	transport: "codex",
	authKind: "none",
	ossProvider: "ollama",
});

test("probe passes when the model is present", async () => {
	const fetchFn = async () =>
		new Response(JSON.stringify({ models: [{ name: "qwen3-coder" }] }), {
			status: 200,
		});
	const r = await probeLocalEndpoint(ollama, fetchFn, {});
	expect(r.ok).toBe(true);
});

test("probe fails when the model is missing", async () => {
	const fetchFn = async () =>
		new Response(JSON.stringify({ models: [{ name: "llama3.1" }] }), {
			status: 200,
		});
	const r = await probeLocalEndpoint(ollama, fetchFn, {});
	expect(r.ok).toBe(false);
	expect(r.detail).toContain("qwen3-coder");
});

test("probe fails when the server is unreachable", async () => {
	const fetchFn = async () => {
		throw new Error("ECONNREFUSED");
	};
	const r = await probeLocalEndpoint(ollama, fetchFn, {});
	expect(r.ok).toBe(false);
	expect(r.detail).toMatch(/unreachable|ECONNREFUSED/);
});

test("openai-compat probe checks local /v1/models without auth", async () => {
	const profile = ModelProfile.parse({
		name: "ollama-judge",
		provider: "ollama",
		modelId: "gemma4:latest",
		transport: "openai-compat",
		baseUrl: "http://localhost:11434/v1",
		authKind: "none",
	});
	let auth = "";
	const fetchFn = async (
		_input: string | URL | Request,
		init?: RequestInit,
	) => {
		auth = String(
			(init?.headers as Record<string, string>)?.Authorization ?? "",
		);
		return new Response(
			JSON.stringify({ data: [{ id: "gemma4:latest" }] }),
			{ status: 200 },
		);
	};

	const r = await probeLocalEndpoint(profile, fetchFn, {});
	expect(r.ok).toBe(true);
	expect(auth).toBe("");
});
