import { expect, test } from "bun:test";
import { probeStudioModel } from "../src/studio/model-probe";

test("studio model probe reports local reachability through the shared probe", async () => {
	const out = await probeStudioModel(
		"ollama-qwen3.6-judge",
		async () =>
			new Response(
				JSON.stringify({
					models: [{ name: "qwen3.6:35b" }],
				}),
			),
		{},
	);

	expect(out).toMatchObject({
		name: "ollama-qwen3.6-judge",
		probeable: true,
		ok: true,
	});
	expect(out.detail).toContain("qwen3.6:35b present");
});

test("studio model probe marks hosted profiles as not probeable", async () => {
	const out = await probeStudioModel("claude-opus-4-6");

	expect(out).toEqual({
		name: "claude-opus-4-6",
		probeable: false,
		ok: true,
		detail: "hosted profile; no local endpoint probe",
	});
});
