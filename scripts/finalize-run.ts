/**
 * finalize-run.ts — assemble results.json + scorecard.md for a run directory
 * whose top-level results were never written (e.g. the studio grade crashed or
 * was killed mid-grade, leaving per-trial provenance.json + grades.json but no
 * results.json). `report` re-weights an *existing* results.json; this builds
 * one from on-disk artifacts so a crashed run is recoverable without re-running.
 *
 * Reconstructs each TrialResult from disk:
 *   - provenance  ← trials/<id>/provenance.json
 *   - telemetry   ← recomputed from trials/<id>/transcripts/session-*.jsonl
 *   - grades      ← trials/<id>/grades.json (null if not graded yet)
 * then calls the same buildResults/writeResults/writeScorecard the run path uses.
 *
 * Usage:
 *   bun scripts/finalize-run.ts <run-dir> [--weights a,q,s,t]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { parseStreamJson } from "../src/driver/claude";
import { aggregateTelemetry } from "../src/driver/telemetry";
import { writeScorecard } from "../src/report/markdown";
import { buildResults, writeResults } from "../src/report/results";
import {
	type SessionRecord,
	type TrialGrades,
	type TrialProvenance,
	type TrialResult,
	RunConfig,
	Weights,
} from "../src/types";

const DEFAULTS_PATH = "config/run.defaults.yaml";

const runDir = process.argv[2];
if (!runDir || !existsSync(runDir)) {
	console.error("usage: finalize-run.ts <run-dir> [--weights a,q,s,t]");
	process.exit(1);
}

const trialsDir = join(runDir, "trials");
if (!existsSync(trialsDir)) {
	console.error(`no trials/ under ${runDir}`);
	process.exit(1);
}

/** Recompute a trial's telemetry from its archived stream-json transcripts. */
function telemetryFromTranscripts(trialDir: string) {
	const tDir = join(trialDir, "transcripts");
	if (!existsSync(tDir)) return null;
	const files = readdirSync(tDir)
		.filter((f) => /^session-\d+\.jsonl$/.test(f))
		.sort();
	if (files.length === 0) return null;
	const records: SessionRecord[] = [];
	files.forEach((f, i) => {
		const raw = readFileSync(join(tDir, f), "utf8");
		try {
			// exitCode 0: the build already terminated; isError is taken from the
			// result line itself, so a clean 0 here does not mask a failed session.
			records.push(parseStreamJson(raw, i, 0).record);
		} catch {
			// A transcript with no result line (e.g. an aborted grading session that
			// leaked into the transcripts dir) contributes no telemetry.
		}
	});
	if (records.length === 0) return null;
	// setupDurationMs is not separately persisted post-hoc; agent working time is
	// the sum of session durations, which is what speed scoring consumes.
	return aggregateTelemetry(records, 0);
}

const defaults = parse(readFileSync(DEFAULTS_PATH, "utf8")) as Record<
	string,
	unknown
>;

const trialIds = readdirSync(trialsDir).filter((d) =>
	existsSync(join(trialsDir, d, "provenance.json")),
);
if (trialIds.length === 0) {
	console.error(`no trials with provenance.json under ${trialsDir}`);
	process.exit(1);
}

const trials: TrialResult[] = [];
const candidateCounts = new Map<string, number>();
for (const id of trialIds.sort()) {
	const trialDir = join(trialsDir, id);
	const provenance = JSON.parse(
		readFileSync(join(trialDir, "provenance.json"), "utf8"),
	) as TrialProvenance;
	const gradesPath = join(trialDir, "grades.json");
	const grades = existsSync(gradesPath)
		? (JSON.parse(readFileSync(gradesPath, "utf8")) as TrialGrades)
		: null;
	const telemetry = telemetryFromTranscripts(trialDir);
	trials.push({ provenance, telemetry, grades });
	candidateCounts.set(
		provenance.candidate,
		(candidateCounts.get(provenance.candidate) ?? 0) + 1,
	);
	console.log(
		`  ${id}: telemetry ${telemetry ? "ok" : "—"}, grades ${grades ? "ok" : "PENDING"}`,
	);
}

// --weights override, else run.defaults weights.
let weights: Weights | undefined;
const wIdx = process.argv.indexOf("--weights");
const wArg = wIdx >= 0 ? process.argv[wIdx + 1] : undefined;
if (wArg) {
	const [a, q, s, t] = wArg.split(",").map(Number);
	weights = Weights.parse({
		prdAdherence: a,
		codeQuality: q,
		speed: s,
		tokenSpend: t,
	});
}

const first = trials[0]?.provenance;
if (!first) {
	console.error("no trials assembled");
	process.exit(1);
}
const candidates = [...candidateCounts.keys()];
const config = RunConfig.parse({
	...defaults,
	candidates,
	// Per-candidate trial count actually present on disk (not the default 3).
	trialsPerCandidate: Math.max(...candidateCounts.values()),
	harness: first.harness,
	model: first.model,
	provider: first.provider,
});

const startedAt = trials
	.map((t) => t.provenance.startedAt)
	.sort()[0] as string;
const endedAt =
	trials
		.map((t) => t.provenance.endedAt)
		.filter(Boolean)
		.sort()
		.at(-1) ?? null;

const results = buildResults({
	runId: first.runId,
	config,
	weights,
	prdSha256: first.prdSha256,
	testPlanSha256: first.testPlanSha256,
	startedAt,
	endedAt,
	trials,
	workerModel: first.workerModel,
	// Judge defaults to the pinned non-worker model; cross-vendor only when the
	// worker is non-Anthropic (judge is Anthropic sonnet).
	judgeModel: {
		name: String(config.judgeModel),
		provider: "anthropic",
		modelId: String(config.judgeModel),
		endpointHost: null,
	},
	crossVendorJudge: first.workerModel?.provider !== "anthropic",
	costSource: "harness-reported",
});

console.log(`results:   ${writeResults(runDir, results)}`);
console.log(`scorecard: ${writeScorecard(runDir, results)}`);
