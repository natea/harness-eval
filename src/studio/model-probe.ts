import {
	loadModels,
	type ModelProfile,
	resolveProfile,
} from "../models";
import {
	type FetchLike,
	probeLocalEndpoint,
} from "../models-probe";

export interface StudioModelProbeResult {
	name: string;
	probeable: boolean;
	ok: boolean;
	detail: string;
}

function canProbe(profile: ModelProfile): boolean {
	return Boolean(profile.ossProvider || profile.transport === "openai-compat");
}

export async function probeStudioModel(
	name: string,
	fetchFn: FetchLike = fetch,
	env: NodeJS.ProcessEnv = process.env,
): Promise<StudioModelProbeResult> {
	const profile = resolveProfile(name, loadModels());
	if (!canProbe(profile)) {
		return {
			name: profile.name,
			probeable: false,
			ok: true,
			detail: "hosted profile; no local endpoint probe",
		};
	}
	const result = await probeLocalEndpoint(profile, fetchFn, env);
	return {
		name: profile.name,
		probeable: true,
		ok: result.ok,
		detail: result.detail,
	};
}
