import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Sandbox } from "../providers/types";
import { renderTrial } from "../report/transcript-render";

const REDACTED = "[REDACTED:secret]";

/** Env var names whose values are treated as secrets when present. */
const SECRET_ENV_VARS = [
	"DAYTONA_API_KEY",
	"ANTHROPIC_API_KEY",
	"LINEAR_API_KEY",
	"ZAI_API_KEY",
	"KIMI_API_KEY",
	"MINIMAX_API_KEY",
	"DASHSCOPE_API_KEY",
	"OPENAI_API_KEY",
];

/** Patterns matching well-known credential shapes, independent of env. */
const SECRET_PATTERNS: RegExp[] = [
	/lin_api_[A-Za-z0-9]{20,}/g,
	/dtn_[a-f0-9]{32,}/g,
	/sk-ant-[A-Za-z0-9-_]{20,}/g,
	/sk-proj-[A-Za-z0-9-_]{20,}/g,
	/sk-[A-Za-z0-9]{32,}/g,
	/gh[pousr]_[A-Za-z0-9]{20,}/g,
	/e2b_[A-Za-z0-9]{20,}/g,
];

export function collectSecretValues(
	env: NodeJS.ProcessEnv = process.env,
): string[] {
	return SECRET_ENV_VARS.map((k) => env[k]).filter((v): v is string =>
		Boolean(v && v.length >= 8),
	);
}

/** Redact known secret values and credential-shaped strings from text. */
export function redactSecrets(
	text: string,
	secretValues: string[] = collectSecretValues(),
): {
	text: string;
	redactions: number;
} {
	let out = text;
	let redactions = 0;
	for (const value of secretValues) {
		if (out.includes(value)) {
			redactions += out.split(value).length - 1;
			out = out.replaceAll(value, REDACTED);
		}
	}
	for (const pattern of SECRET_PATTERNS) {
		out = out.replace(pattern, () => {
			redactions++;
			return REDACTED;
		});
	}
	return { text: out, redactions };
}

const TEXT_EXTENSIONS = new Set([
	".ts",
	".js",
	".tsx",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".jsonl",
	".md",
	".txt",
	".yaml",
	".yml",
	".toml",
	".sh",
	".bash",
	".zsh",
	".env",
	".py",
	".go",
	".rs",
	".log",
	".html",
	".css",
	".sql",
	".xml",
	".ini",
	".cfg",
]);

function isTextFile(path: string): boolean {
	const dot = path.lastIndexOf(".");
	if (dot === -1) return true; // extensionless (scripts, logs)
	return TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

/** Walk a directory and redact secrets in every text file, in place. */
export function redactDirectory(
	dir: string,
	secretValues: string[] = collectSecretValues(),
): number {
	let total = 0;
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const st = statSync(p);
		if (st.isDirectory()) {
			if (entry === ".git" || entry === "node_modules") continue;
			total += redactDirectory(p, secretValues);
		} else if (st.isFile() && st.size < 16 * 1024 * 1024 && isTextFile(p)) {
			const content = readFileSync(p, "utf8");
			const { text, redactions } = redactSecrets(content, secretValues);
			if (redactions > 0) {
				writeFileSync(p, text);
				total += redactions;
			}
		}
	}
	return total;
}

export interface ArchiveResult {
	workspaceDir: string;
	transcriptPaths: string[];
	redactions: number;
}

/**
 * Archive trial artifacts (workspace + transcripts) to the host run
 * directory BEFORE sandbox teardown, redacting secrets (run-telemetry spec:
 * archive before teardown; secret hygiene).
 */
export async function archiveTrial(
	sandbox: Sandbox,
	trialDir: string,
	transcripts: string[],
): Promise<ArchiveResult> {
	const workspaceDir = join(trialDir, "workspace");
	const transcriptsDir = join(trialDir, "transcripts");
	mkdirSync(transcriptsDir, { recursive: true });

	await sandbox.copyOut(sandbox.workspacePath, workspaceDir);

	const secretValues = collectSecretValues();
	let redactions = redactDirectory(workspaceDir, secretValues);

	const transcriptPaths: string[] = [];
	for (const [i, transcript] of transcripts.entries()) {
		const { text, redactions: r } = redactSecrets(transcript, secretValues);
		redactions += r;
		const p = join(
			transcriptsDir,
			`session-${String(i).padStart(3, "0")}.jsonl`,
		);
		writeFileSync(p, text);
		transcriptPaths.push(p);
	}
	if (redactions > 0) {
		console.warn(
			`[archive] redacted ${redactions} secret occurrence(s) in ${trialDir}`,
		);
	}

	// Readable audit rendering (trial-transcript-audit). renderTrial re-reads the
	// redacted `.jsonl` we just wrote, so the Markdown only ever derives from
	// already-redacted content — no new secret-egress path. The `.jsonl` stays the
	// unabridged ground truth; the Markdown is a derived convenience artifact.
	if (transcriptPaths.length > 0) {
		try {
			const rendered = renderTrial(trialDir);
			for (const s of rendered.sessions) {
				writeFileSync(
					join(transcriptsDir, s.name.replace(/\.jsonl$/, ".md")),
					s.md,
				);
			}
			writeFileSync(
				join(transcriptsDir, "conversation.md"),
				rendered.conversationMd,
			);
		} catch (e) {
			// Rendering is best-effort: a malformed transcript must never fail the
			// archive (the `.jsonl` ground truth is already safely written).
			console.warn(
				`[archive] transcript rendering skipped for ${trialDir}: ${String(e).slice(0, 120)}`,
			);
		}
	}

	return { workspaceDir, transcriptPaths, redactions };
}
