import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { DesignSpec } from "../designs";

/**
 * Static design-adherence scorer (design-adherence capability, v1 — no browser).
 * Extracts the *declared* tokens an implementation realizes (CSS custom
 * properties, theme/Tailwind values, inline/utility color + font usage) and
 * compares them to a DESIGN.md spec: colors by perceptual distance (ΔE, CIE76),
 * typography by font-family / size. Produces a 0–100 score per category and
 * overall, with the matched/missed tokens recorded as evidence.
 *
 * v1 measures *declared-token* adherence — a framework could declare the palette
 * but render off-spec; the browser-based v2 (computed styles) closes that gap.
 */

const TEXT_EXT = new Set([
	".css",
	".scss",
	".less",
	".ts",
	".tsx",
	".js",
	".jsx",
	".html",
	".vue",
	".svelte",
	".json",
]);
const SKIP_DIR = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	"coverage",
	".cache",
]);

/** ΔE threshold (CIE76) under which two colors count as the same token. */
export const DELTA_E_MATCH = 12;

// ---- color math: hex → Lab, CIE76 ΔE ----

function hexToRgb(hex: string): [number, number, number] | null {
	let h = hex.replace("#", "").toLowerCase();
	if (h.length === 3)
		h = h
			.split("")
			.map((c) => c + c)
			.join("");
	if (h.length === 8) h = h.slice(0, 6); // drop alpha
	if (h.length !== 6 || /[^0-9a-f]/.test(h)) return null;
	return [
		Number.parseInt(h.slice(0, 2), 16),
		Number.parseInt(h.slice(2, 4), 16),
		Number.parseInt(h.slice(4, 6), 16),
	];
}

function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
	const f = (c: number) => {
		const x = c / 255;
		return x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92;
	};
	const [R, G, B] = [f(r), f(g), f(b)];
	// sRGB → XYZ (D65)
	const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
	const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
	const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
	const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	const [fx, fy, fz] = [g2(x), g2(y), g2(z)];
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 perceptual color distance between two hex colors (null if unparseable). */
export function deltaE(hex1: string, hex2: string): number | null {
	const a = hexToRgb(hex1);
	const b = hexToRgb(hex2);
	if (!a || !b) return null;
	const [l1, a1, b1] = rgbToLab(a);
	const [l2, a2, b2] = rgbToLab(b);
	return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// ---- token extraction from a built workspace ----

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FONT_RE = /font-?family['"\s:=]+([^;"'`\n}]+)/gi;

export interface RealizedTokens {
	colors: string[]; // unique #rrggbb
	fonts: string[]; // unique lowercased family names
	filesScanned: number;
}

export function extractRealizedTokens(workspaceDir: string): RealizedTokens {
	const colors = new Set<string>();
	const fonts = new Set<string>();
	let filesScanned = 0;

	const walk = (dir: string) => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			if (SKIP_DIR.has(name)) continue;
			const p = join(dir, name);
			let st: ReturnType<typeof statSync>;
			try {
				st = statSync(p);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				walk(p);
			} else if (TEXT_EXT.has(extname(name)) && st.size < 1_000_000) {
				filesScanned++;
				const text = readFileSync(p, "utf8");
				for (const m of text.matchAll(HEX_RE)) {
					const rgb = hexToRgb(m[0]);
					if (rgb)
						colors.add(
							`#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
						);
				}
				for (const m of text.matchAll(FONT_RE)) {
					const first = m[1]
						?.split(",")[0]
						?.replace(/['"]/g, "")
						.trim()
						.toLowerCase();
					if (first && first.length < 40) fonts.add(first);
				}
			}
		}
	};
	if (existsSync(workspaceDir)) walk(workspaceDir);
	return {
		colors: [...colors],
		fonts: [...fonts],
		filesScanned,
	};
}

// ---- scoring ----

export interface ColorMatch {
	token: string;
	hex: string;
	nearest: string | null;
	deltaE: number | null;
	matched: boolean;
}
export interface TypeMatch {
	style: string;
	family?: string;
	matched: boolean;
}

export interface DesignAdherence {
	score: number; // 0–100 overall
	color: { score: number; matches: ColorMatch[] };
	typography: { score: number; matches: TypeMatch[] };
	realized: RealizedTokens;
	note: string;
}

/**
 * Score how closely a built implementation's declared tokens match a design.
 * `fontAliases` (normalized lowercase, from the design's provenance) credits
 * accepted substitutions for non-distributable brand fonts — e.g. a build using
 * "inter" satisfies a spec that names "linear display".
 */
export function scoreDesignAdherence(
	workspaceDir: string,
	spec: DesignSpec,
	fontAliases: Record<string, string[]> = {},
): DesignAdherence {
	const realized = extractRealizedTokens(workspaceDir);

	// Color: nearest realized color per spec token by ΔE.
	const colorMatches: ColorMatch[] = Object.entries(spec.colors).map(
		([token, hex]) => {
			let nearest: string | null = null;
			let best = Number.POSITIVE_INFINITY;
			for (const c of realized.colors) {
				const d = deltaE(hex, c);
				if (d != null && d < best) {
					best = d;
					nearest = c;
				}
			}
			return {
				token,
				hex,
				nearest,
				deltaE: nearest ? Math.round(best * 10) / 10 : null,
				matched: best <= DELTA_E_MATCH,
			};
		},
	);
	const colorScore = colorMatches.length
		? (colorMatches.filter((m) => m.matched).length / colorMatches.length) * 100
		: 0;

	// Typography: the style's font-family appears in the realized fonts.
	const typeMatches: TypeMatch[] = Object.entries(spec.typography).map(
		([style, def]) => {
			const family = (def as { fontFamily?: string })?.fontFamily
				?.split(",")[0]
				?.replace(/['"]/g, "")
				.trim()
				.toLowerCase();
			const accepted = family
				? [family, ...(fontAliases[family] ?? [])]
				: [];
			return {
				style,
				family,
				matched: accepted.some((f) => realized.fonts.includes(f)),
			};
		},
	);
	const typeScore = typeMatches.length
		? (typeMatches.filter((m) => m.matched).length / typeMatches.length) * 100
		: 0;

	// Color dominates brand perception; type is secondary.
	const score = Math.round((colorScore * 0.75 + typeScore * 0.25) * 10) / 10;

	return {
		score,
		color: { score: Math.round(colorScore * 10) / 10, matches: colorMatches },
		typography: { score: Math.round(typeScore * 10) / 10, matches: typeMatches },
		realized,
		note: "declared-token adherence (static, no browser); a v2 browser pass measures rendered computed styles",
	};
}
