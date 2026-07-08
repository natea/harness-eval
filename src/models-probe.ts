import type { ModelProfile } from "./models";

export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export interface ModelProbeResult {
	ok: boolean;
	detail: string;
}

function localEndpoint(p: ModelProfile, env: NodeJS.ProcessEnv): string {
	if (p.transport === "openai-compat" && p.baseUrl) {
		return `${p.baseUrl.replace(/\/+$/, "")}/models`;
	}
	const base = env.OLLAMA_BASE_URL ?? "http://localhost:11434";
	const trimmed = base.replace(/\/+$/, "");
	return `${trimmed}/api/tags`;
}

function modelMatches(found: string, requested: string): boolean {
	return (
		found === requested ||
		(!requested.includes(":") && found === `${requested}:latest`)
	);
}

export async function probeLocalEndpoint(
	p: ModelProfile,
	fetchFn: FetchLike = fetch,
	env: NodeJS.ProcessEnv = process.env,
): Promise<ModelProbeResult> {
	if (!p.ossProvider && p.transport !== "openai-compat") {
		return {
			ok: false,
			detail: `profile '${p.name}' is not a local or OpenAI-compatible profile`,
		};
	}

	const url = localEndpoint(p, env);
	let names: string[];
	try {
		const res = await fetchFn(url);
		if (!res.ok) {
			return { ok: false, detail: `${url} returned HTTP ${res.status}` };
		}
		const body = (await res.json()) as Record<string, unknown>;
		const list = (body.models ?? body.data ?? []) as Record<string, unknown>[];
		names = list.map((m) => String(m.name ?? m.id ?? "")).filter(Boolean);
	} catch (e) {
		return { ok: false, detail: `${url} unreachable: ${(e as Error).message}` };
	}

	if (p.modelId === "default") {
		if (names.length === 0) {
			return { ok: false, detail: `${url} reachable but no model is loaded` };
		}
		return {
			ok: true,
			detail: `${url} reachable; loaded: ${names.join(", ")}`,
		};
	}

	if (!names.some((name) => modelMatches(name, p.modelId))) {
		return {
			ok: false,
			detail: `model '${p.modelId}' not found at ${url}; start the server and pull it (e.g. \`ollama pull ${p.modelId}\`). Present: ${names.join(", ") || "none"}`,
		};
	}

	return { ok: true, detail: `${p.modelId} present at ${url}` };
}
