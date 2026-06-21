import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { HarnessId, type HarnessId as HarnessIdType } from "./types";

export class HarnessError extends Error {}

export const HarnessDriver = z.enum(["claude-code", "codex"]);
export type HarnessDriver = z.infer<typeof HarnessDriver>;

export const HarnessDefinition = z.object({
	id: HarnessId,
	name: z.string().min(1),
	driver: HarnessDriver,
	defaultVersion: z.string().min(1),
});
export type HarnessDefinition = z.infer<typeof HarnessDefinition>;

const HarnessConfig = z.object({
	harnesses: z.array(HarnessDefinition).min(1),
});

export type HarnessRegistry = Map<HarnessIdType, HarnessDefinition>;

export function loadHarnesses(path = "config/harnesses.yaml"): HarnessRegistry {
	let raw: unknown;
	try {
		raw = parse(readFileSync(path, "utf8"));
	} catch (err) {
		throw new HarnessError(
			`failed to read harness registry at ${path}: ${err}`,
		);
	}
	const parsed = HarnessConfig.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  ${i.path.join(".")}: ${i.message}`)
			.join("\n");
		throw new HarnessError(`invalid harness registry ${path}:\n${issues}`);
	}
	const registry: HarnessRegistry = new Map();
	for (const h of parsed.data.harnesses) {
		if (registry.has(h.id)) {
			throw new HarnessError(`duplicate harness id: ${h.id}`);
		}
		registry.set(h.id, h);
	}
	return registry;
}

export function listHarnesses(
	registry: HarnessRegistry = loadHarnesses(),
): HarnessDefinition[] {
	return [...registry.values()];
}

export function resolveHarness(
	id: string,
	registry: HarnessRegistry = loadHarnesses(),
): HarnessDefinition {
	const syntax = HarnessId.safeParse(id);
	if (!syntax.success) {
		throw new HarnessError(`invalid harness id '${id}'`);
	}
	const harness = registry.get(syntax.data);
	if (!harness) {
		const known = [...registry.keys()].join(", ") || "none";
		throw new HarnessError(`unknown harness '${id}' (known: ${known})`);
	}
	return harness;
}
