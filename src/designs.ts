import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Design-system catalog (design-adherence capability). A design is a frozen
 * `DESIGN.md` token spec under `designs/<name>/`: YAML frontmatter (semantic
 * color tokens, a typography scale, spacing, radius) plus prose. Provenance for
 * vendored designs lives in `designs/provenance.yaml`; the upstream notice in
 * `designs/NOTICE`.
 */

export const DesignSpec = z
	.object({
		name: z.string(),
		description: z.string().optional(),
		// semantic token → hex (e.g. primary: "#5e6ad2").
		colors: z.record(z.string(), z.string()).default({}),
		// scale name → { fontFamily, fontSize, fontWeight, ... }.
		typography: z.record(z.string(), z.unknown()).default({}),
		spacing: z.record(z.string(), z.unknown()).optional(),
		radius: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();
export type DesignSpec = z.infer<typeof DesignSpec>;

export const DesignSource = z.object({
	upstream: z.string().min(1),
	repo: z.string().url(),
	commit: z.string().min(7),
	originalDir: z.string().min(1),
	license: z.string().min(1),
});
export type DesignSource = z.infer<typeof DesignSource>;

export class DesignError extends Error {}

export interface LoadedDesign {
	name: string;
	dir: string;
	sha256: string;
	content: string;
	spec: DesignSpec;
	source: DesignSource;
}

/** Extract the leading `---` … `---` YAML frontmatter block. */
function frontmatter(raw: string): string {
	const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
	if (!m?.[1]) throw new DesignError("DESIGN.md is missing YAML frontmatter");
	return m[1];
}

function loadProvenance(designsDir: string, name: string): DesignSource {
	const lock = join(designsDir, "provenance.yaml");
	if (!existsSync(lock))
		throw new DesignError(
			`${lock} missing — vendored designs must record provenance`,
		);
	const data = parse(readFileSync(lock, "utf8")) as {
		upstream?: string;
		repo?: string;
		commit?: string;
		license?: string;
		designs?: Record<string, { originalDir?: string }>;
	};
	const entry = data.designs?.[name];
	if (!entry?.originalDir)
		throw new DesignError(
			`design '${name}' has no entry in ${lock} — record its provenance`,
		);
	return DesignSource.parse({
		upstream: data.upstream,
		repo: data.repo,
		commit: data.commit,
		originalDir: entry.originalDir,
		license: data.license,
	});
}

/** Load + validate a design: frontmatter schema, content hash, provenance,
 *  and the preserved upstream notice. */
export function loadDesign(name: string, designsDir = "designs"): LoadedDesign {
	const dir = resolve(designsDir, name);
	const file = join(dir, "DESIGN.md");
	if (!existsSync(file)) {
		const available = existsSync(designsDir)
			? readdirSync(designsDir).filter((d) =>
					existsSync(join(designsDir, d, "DESIGN.md")),
				)
			: [];
		throw new DesignError(
			`no design '${name}' (available: ${available.join(", ") || "none"})`,
		);
	}
	const content = readFileSync(file, "utf8");
	const sha256 = createHash("sha256").update(content).digest("hex");
	const parsed = DesignSpec.safeParse(parse(frontmatter(content)));
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  ${i.path.join(".")}: ${i.message}`)
			.join("\n");
		throw new DesignError(`invalid DESIGN.md frontmatter for '${name}':\n${issues}`);
	}
	const source = loadProvenance(designsDir, name);
	if (!existsSync(join(designsDir, "NOTICE")))
		throw new DesignError(
			`${join(designsDir, "NOTICE")} missing — preserve the upstream attribution`,
		);
	return { name, dir, sha256, content, spec: parsed.data, source };
}

/** All loadable designs in the catalog. */
export function listDesigns(designsDir = "designs"): string[] {
	if (!existsSync(designsDir)) return [];
	return readdirSync(designsDir).filter((d) =>
		existsSync(join(designsDir, d, "DESIGN.md")),
	);
}
