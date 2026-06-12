import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { composite } from "../grading/scoring";
import type { CandidateScore, TrialResult, Weights } from "../types";

/* ------------------------------------------------------------------ types */

interface RunSummary {
	runId: string;
	dir: string;
	supported: boolean;
	schemaVersion?: number;
	error?: string;
	summary?: {
		config: {
			harness: string;
			model: string;
			judgeModel: string;
			provider: string;
			trialsPerCandidate: number;
		};
		weights: Weights;
		scores: CandidateScore[];
		inconclusive: boolean;
		startedAt: string;
		prdSha256: string;
		testPlanSha256: string | null;
	};
}

/* ------------------------------------------------------------ shared bits */

const DIM_LABELS: Record<string, string> = {
	prdAdherence: "PRD adherence",
	codeQuality: "Code quality",
	speed: "Speed*",
	tokenSpend: "Token spend*",
};

const HELP: Record<string, string> = {
	Composite:
		"Weighted sum of the four dimension scores using the weights in the panel above (defaults: PRD adherence 40%, code quality 25%, speed 17.5%, token spend 17.5%). Recomputed live when you move the sliders.",
	"PRD adherence":
		"Graded Score, 0–100 (ViBench methodology): an evaluator agent executes the frozen, spec-derived test plan against the BUILT artifact — running it against mock services and recording evidence per step. Weighted partial credit over non-bonus steps; fatal cold-start failures zero the remainder. Absolute scale, comparable across runs.",
	"Code quality":
		"Blind LLM-judge score, 0–100: five criteria (meaningful passing tests, architecture vs the spec's layering, error handling, dead code, documentation), each scored 0–10 three times by a pinned judge model (temperature-fixed, never the worker model) on a copy scrubbed of framework-identifying files; per-criterion medians averaged ×10. Absolute scale.",
	"Speed*":
		"Agent working time: the sum of harness session durations (sandbox setup and grading time excluded), min-max normalized within THIS run's candidate set — fastest mean = 100, slowest = 0, linear between. Not comparable across runs with different candidates.",
	"Token spend*":
		"Total cost across sessions (harness-reported USD; token counts when pricing is unavailable), min-max normalized within THIS run's candidate set — cheapest = 100, priciest = 0. Not comparable across runs with different candidates.",
	"±σ": "Standard deviation of per-trial composite scores for this candidate. When the top two candidates' ranges (mean ± σ) overlap, the ranking is flagged inconclusive.",
	Trials:
		"Number of graded trials counted for this candidate (completed or budget-capped with an artifact). Capped trials flag the row as right-censored.",
};

function Th({ label }: { label: string }) {
	const help = HELP[label];
	return (
		<th>
			{label}
			{help && (
				<span
					className="tip"
					data-tip={help}
					style={{ marginLeft: 4, color: "#8b949e" }}
				>
					ⓘ
				</span>
			)}
		</th>
	);
}

function Bar({ v }: { v: number }) {
	return (
		<>
			<span className="bar" style={{ width: `${Math.max(1, v) * 0.6}px` }} />{" "}
			<span className="mono">{v.toFixed(1)}</span>
		</>
	);
}

function useFetch<T>(url: string): T | undefined {
	const [data, setData] = useState<T>();
	useEffect(() => {
		fetch(url)
			.then((r) => r.json())
			.then((d) => setData(d as T))
			.catch(() => setData(undefined));
	}, [url]);
	return data;
}

/* --------------------------------------------------------- weight controls */

const DEFAULT_WEIGHTS: Weights = {
	prdAdherence: 0.4,
	codeQuality: 0.25,
	speed: 0.175,
	tokenSpend: 0.175,
};

function WeightControls({
	weights,
	onChange,
}: {
	weights: Weights;
	onChange: (w: Weights) => void;
}) {
	const set = (k: keyof Weights, v: number) => {
		const next = { ...weights, [k]: v };
		const sum =
			next.prdAdherence + next.codeQuality + next.speed + next.tokenSpend;
		onChange({
			prdAdherence: next.prdAdherence / sum,
			codeQuality: next.codeQuality / sum,
			speed: next.speed / sum,
			tokenSpend: next.tokenSpend / sum,
		});
	};
	return (
		<div className="weights">
			<strong>Re-weight (ephemeral, client-side)</strong>{" "}
			<button type="button" onClick={() => onChange(DEFAULT_WEIGHTS)}>
				reset
			</button>
			<div className="sliders">
				{(Object.keys(DIM_LABELS) as (keyof Weights)[]).map((k) => (
					<label key={k}>
						{DIM_LABELS[k]}{" "}
						<span
							className="mono"
							style={{
								display: "inline-block",
								width: "3.2em",
								textAlign: "right",
							}}
						>
							{(weights[k] * 100).toFixed(1)}%
						</span>
						<input
							type="range"
							min={0}
							max={100}
							value={weights[k] * 100}
							onChange={(e) => set(k, Number(e.currentTarget.value) / 100)}
						/>
					</label>
				))}
			</div>
		</div>
	);
}

/** Recompute composites from stored per-dimension scores (design D4). */
function reweight(
	scores: CandidateScore[],
	w: Weights,
): (CandidateScore & { rw: number })[] {
	return scores
		.map((s) => ({ ...s, rw: composite(s.dimensions, w) }))
		.sort((a, b) => b.rw - a.rw);
}

/* -------------------------------------------------------------- leaderboard */

function Leaderboard() {
	const runs = useFetch<RunSummary[]>("/api/runs");
	const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	if (!runs) return <p className="muted">loading…</p>;

	const supported = runs.filter((r) => r.supported && r.summary);
	const active = supported.filter(
		(r) => selected.size === 0 || selected.has(r.runId),
	);

	// Aggregate: mean of per-run (re-weighted) composites per candidate/harness/model (design D3).
	const byKey = new Map<
		string,
		{ rows: (CandidateScore & { rw: number })[]; runs: number }
	>();
	for (const r of active) {
		for (const s of reweight(r.summary!.scores, weights)) {
			const key = `${s.candidate}|${s.harness}|${s.model}`;
			const slot = byKey.get(key) ?? { rows: [], runs: 0 };
			slot.rows.push(s);
			slot.runs++;
			byKey.set(key, slot);
		}
	}
	const candidateSets = active.map((r) =>
		r
			.summary!.scores.map((s) => s.candidate)
			.sort()
			.join(","),
	);
	const mixedSets = new Set(candidateSets).size > 1;

	const rows = [...byKey.entries()]
		.map(([key, { rows: rs, runs: n }]) => {
			const mean = (f: (s: CandidateScore & { rw: number }) => number) =>
				rs.reduce((a, s) => a + f(s), 0) / rs.length;
			const [candidate, harness, model] = key.split("|");
			return {
				candidate,
				harness,
				model,
				composite: mean((s) => s.rw),
				dims: {
					prdAdherence: mean((s) => s.dimensions.prdAdherence),
					codeQuality: mean((s) => s.dimensions.codeQuality),
					speed: mean((s) => s.dimensions.speed),
					tokenSpend: mean((s) => s.dimensions.tokenSpend),
				},
				trials: rs.reduce((a, s) => a + s.trialsCounted, 0),
				runs: n,
				censored: rs.some((s) => s.rightCensored),
			};
		})
		.sort((a, b) => b.composite - a.composite);

	return (
		<>
			<h1>🏆 Coding-harness leaderboard</h1>
			<WeightControls weights={weights} onChange={setWeights} />
			{mixedSets && (
				<p>
					<span className="badge warn">
						mixed candidate sets across selected runs — speed*/spend* are
						within-run normalized and not comparable across them
					</span>
				</p>
			)}
			<table>
				<thead>
					<tr>
						<th>#</th>
						<th>Candidate</th>
						<th>Harness / model</th>
						<Th label="Composite" />
						{Object.values(DIM_LABELS).map((l) => (
							<Th key={l} label={l} />
						))}
						<Th label="Trials" />
						<th>Flags</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={r.candidate}>
							<td>{i + 1}</td>
							<td>
								<strong>{r.candidate}</strong>
							</td>
							<td className="muted mono">
								{r.harness} / {r.model}
							</td>
							<td>
								<Bar v={r.composite} />
							</td>
							{(Object.keys(DIM_LABELS) as (keyof Weights)[]).map((k) => (
								<td key={k}>
									<Bar v={r.dims[k]} />
								</td>
							))}
							<td>{r.trials}</td>
							<td>
								{r.censored && (
									<span className="badge flag">right-censored</span>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="muted">
				* speed and token spend are min-max normalized within each run's
				candidate set.
			</p>

			<h2>Runs</h2>
			<table>
				<thead>
					<tr>
						<th />
						<th>Run</th>
						<th>Provider</th>
						<th>Candidates</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{runs.map((r) => (
						<tr key={r.runId}>
							<td>
								{r.supported && (
									<input
										type="checkbox"
										checked={selected.size === 0 || selected.has(r.runId)}
										onChange={(e) => {
											const next = new Set(
												selected.size === 0
													? supported.map((x) => x.runId)
													: selected,
											);
											if (e.currentTarget.checked) next.add(r.runId);
											else next.delete(r.runId);
											setSelected(
												next.size === supported.length ? new Set() : next,
											);
										}}
									/>
								)}
							</td>
							<td>
								<a href={`/runs/${r.runId}`}>{r.runId}</a>
							</td>
							<td className="muted">{r.summary?.config.provider ?? "—"}</td>
							<td className="muted">
								{r.summary
									? r.summary.scores.map((s) => s.candidate).join(", ")
									: "—"}
							</td>
							<td>
								{r.supported ? (
									r.summary?.inconclusive ? (
										<span className="badge warn">inconclusive ordering</span>
									) : (
										<span className="badge ok">ok</span>
									)
								) : (
									<span className="badge flag" title={r.error}>
										unsupported
									</span>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}

/* ----------------------------------------------------------------- run view */

function RunView({ runId }: { runId: string }) {
	const entry = useFetch<{
		supported: boolean;
		error?: string;
		results?: {
			config: Record<string, unknown>;
			weights: Weights;
			scores: CandidateScore[];
			trials: TrialResult[];
			exclusions: { trialId: string; status: string; reason: string }[];
			inconclusive: boolean;
			prdSha256: string;
			testPlanSha256: string | null;
			startedAt: string;
			endedAt: string | null;
		};
	}>(`/api/runs/${runId}`);
	const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
	if (!entry) return <p className="muted">loading…</p>;
	if (!entry.supported || !entry.results)
		return (
			<p>
				<span className="badge flag">unsupported</span> {entry.error}
			</p>
		);
	const r = entry.results;
	const rows = reweight(r.scores, weights);
	const combined = runId.startsWith("combined:");
	const parts = combined ? runId.slice("combined:".length).split("+") : [];
	const fmt = (iso: string | null) =>
		iso ? new Date(iso).toLocaleString() : "—";
	const spanMin =
		r.endedAt && r.startedAt
			? (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) /
				60000
			: null;
	return (
		<>
			<p>
				<a href="/">← leaderboard</a>
			</p>
			<h1>{combined ? `Combined run (${parts.length} runs)` : runId}</h1>
			<p className="muted">
				🗓 {fmt(r.startedAt)} → {fmt(r.endedAt)}
				{spanMin !== null &&
					` (${spanMin >= 90 ? `${(spanMin / 60).toFixed(1)}h` : `${spanMin.toFixed(0)}m`} span)`}
				{" · "}
				{String(r.config.harness)} / {String(r.config.model)} on{" "}
				{String(r.config.provider)}
				{" · "}judge {String(r.config.judgeModel)}
				{" · "}
				{r.trials.length} trial(s)
			</p>
			{combined && (
				<p className="muted">
					merged from:{" "}
					{parts.map((pp, i) => (
						<span key={pp}>
							{i > 0 && " + "}
							<a href={`/runs/${pp}`}>{pp}</a>
						</span>
					))}
				</p>
			)}
			{r.inconclusive && (
				<p>
					<span className="badge warn">
						top-two composite ranges overlap — ordering inconclusive
					</span>
				</p>
			)}
			<WeightControls weights={weights} onChange={setWeights} />
			<table>
				<thead>
					<tr>
						<th>#</th>
						<th>Candidate</th>
						<Th label="Composite" />
						{Object.values(DIM_LABELS).map((l) => (
							<Th key={l} label={l} />
						))}
						<Th label="±σ" />
						<Th label="Trials" />
					</tr>
				</thead>
				<tbody>
					{rows.map((s, i) => (
						<tr key={s.candidate}>
							<td>{i + 1}</td>
							<td>
								<strong>{s.candidate}</strong>
							</td>
							<td>
								<Bar v={s.rw} />
							</td>
							{(Object.keys(DIM_LABELS) as (keyof Weights)[]).map((k) => (
								<td key={k}>
									<Bar v={s.dimensions[k]} />
								</td>
							))}
							<td className="mono">{s.compositeStats.stddev.toFixed(1)}</td>
							<td>
								{s.trialsCounted}
								{s.rightCensored && <span className="badge flag">capped</span>}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<h2>Trials</h2>
			<table>
				<thead>
					<tr>
						<th>Trial</th>
						<th>Status</th>
						<th>Graded</th>
						<th>Quality</th>
						<th>Agent time</th>
						<th>Cost</th>
						<th>Turns</th>
					</tr>
				</thead>
				<tbody>
					{r.trials.map((t) => (
						<tr key={t.provenance.trialId}>
							<td>
								<a href={`/runs/${runId}/trials/${t.provenance.trialId}`}>
									{t.provenance.trialId}
								</a>
							</td>
							<td>
								{t.provenance.status}
								{t.provenance.cappedBy ? ` (${t.provenance.cappedBy})` : ""}
							</td>
							<td className="mono">
								{t.grades?.adherence
									? t.grades.adherence.gradedScore.toFixed(1)
									: "—"}
							</td>
							<td className="mono">
								{t.grades?.quality ? t.grades.quality.score.toFixed(0) : "—"}
							</td>
							<td className="mono">
								{t.telemetry
									? `${(t.telemetry.agentDurationMs / 60000).toFixed(1)}m`
									: "—"}
							</td>
							<td className="mono">
								{t.telemetry ? `$${t.telemetry.totalCostUsd.toFixed(2)}` : "—"}
							</td>
							<td className="mono">{t.telemetry?.totalTurns ?? "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
			<StepComparison trials={r.trials} />
			{r.exclusions.length > 0 && (
				<>
					<h2>Excluded trials</h2>
					<ul>
						{r.exclusions.map((e) => (
							<li key={e.trialId} className="muted">
								{e.trialId} — {e.status}: {e.reason}
							</li>
						))}
					</ul>
				</>
			)}
			<h2>Provenance</h2>
			<p className="mono muted">
				PRD {r.prdSha256.slice(0, 16)}… · test plan{" "}
				{r.testPlanSha256?.slice(0, 16) ?? "n/a"}… · judge{" "}
				{String(r.config.judgeModel)} · {String(r.config.harness)}/
				{String(r.config.model)} on {String(r.config.provider)} · {r.startedAt}{" "}
				→ {r.endedAt ?? "…"}
			</p>
		</>
	);
}

/* ------------------------------------------------- criterion comparison */

function StepComparison({ trials }: { trials: TrialResult[] }) {
	const stepInfo = useFetch<Record<string, string>>("/api/steps");
	const graded = trials.filter((t) => t.grades?.adherence);
	if (graded.length < 2) return null;
	const stepIds = [
		...new Set(
			graded.flatMap((t) =>
				t.grades!.adherence!.stepResults.map((s) => s.stepId),
			),
		),
	];
	const cell = (t: TrialResult, id: string) => {
		const s = t.grades?.adherence?.stepResults.find((x) => x.stepId === id);
		if (!s) return <>·</>;
		const icon =
			s.outcome === "pass"
				? "✅"
				: s.outcome === "partial"
					? `🟡${s.credit}`
					: "❌";
		// Hover shows the recorded evidence — why credit was docked.
		return (
			<span className="tip" data-tip={s.evidence}>
				{icon}
			</span>
		);
	};
	return (
		<>
			<h2>
				Step comparison{" "}
				<span className="muted">(adherence test plan across trials)</span>
			</h2>
			<table>
				<thead>
					<tr>
						<th>Step</th>
						{graded.map((t) => (
							<th key={t.provenance.trialId} className="mono">
								{t.provenance.trialId}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{stepIds.map((id) => (
						<tr key={id}>
							<td className="mono">
								<span className="tip" data-tip={stepInfo?.[id] ?? "…"}>
									{id}
								</span>
							</td>
							{graded.map((t) => (
								<td key={t.provenance.trialId}>{cell(t, id)}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}

/* --------------------------------------------------------------- trial view */

function TrialView({ runId, trialId }: { runId: string; trialId: string }) {
	const t = useFetch<TrialResult>(`/api/runs/${runId}/trials/${trialId}`);
	if (!t) return <p className="muted">loading…</p>;
	if (!t.provenance) return <p className="badge flag">not found</p>;
	const a = t.grades?.adherence;
	const q = t.grades?.quality;
	const integ = t.grades?.integration;
	return (
		<>
			<p>
				<a href={`/runs/${runId}`}>← {runId}</a>
			</p>
			<h1>{trialId}</h1>
			<p className="mono muted">
				{t.provenance.candidate}@{t.provenance.candidateVersion} ·{" "}
				{t.provenance.harness} {t.provenance.harnessVersion} ·{" "}
				{t.provenance.model} · {t.provenance.provider} (
				{t.provenance.snapshotId ?? "no image"}) · status {t.provenance.status}
			</p>
			{t.telemetry && (
				<p>
					⏱ {(t.telemetry.agentDurationMs / 60000).toFixed(1)}m agent (+
					{(t.telemetry.setupDurationMs / 60000).toFixed(1)}m setup) · 💵 $
					{t.telemetry.totalCostUsd.toFixed(2)} · {t.telemetry.totalTurns} turns
					·{" "}
					{(
						t.telemetry.totalTokens.inputTokens +
						t.telemetry.totalTokens.outputTokens
					).toLocaleString()}{" "}
					tokens (+{t.telemetry.totalTokens.cacheReadTokens.toLocaleString()}{" "}
					cache-read) · {t.telemetry.sessions.length} session(s)
				</p>
			)}
			{a && (
				<>
					<h2>
						PRD adherence: {a.gradedScore.toFixed(2)}{" "}
						{a.passAt1 && <span className="badge ok">pass@1</span>}
						{a.completeFailure && (
							<span className="badge flag">complete failure</span>
						)}
					</h2>
					<table>
						<thead>
							<tr>
								<th>Step</th>
								<th>Outcome</th>
								<th>Credit</th>
								<th>Evidence</th>
							</tr>
						</thead>
						<tbody>
							{a.stepResults.map((s) => (
								<tr key={s.stepId}>
									<td className="mono">{s.stepId}</td>
									<td>
										{s.outcome === "pass"
											? "✅"
											: s.outcome === "partial"
												? "🟡"
												: "❌"}{" "}
										{s.outcome}
									</td>
									<td className="mono">{s.credit}</td>
									<td>
										<details>
											<summary>{s.evidence.slice(0, 90)}…</summary>
											<pre>{s.evidence}</pre>
										</details>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
			{q && (
				<>
					<h2>
						Code quality: {q.score.toFixed(0)}{" "}
						<span className="muted">({q.judgeModel})</span>
					</h2>
					<table>
						<thead>
							<tr>
								<th>Criterion</th>
								<th>Samples</th>
								<th>Median</th>
								<th>Justification</th>
							</tr>
						</thead>
						<tbody>
							{q.criteria.map((c) => (
								<tr key={c.criterion}>
									<td>{c.criterion}</td>
									<td className="mono">{c.samples.join(", ")}</td>
									<td className="mono">{c.score}</td>
									<td>
										<details>
											<summary>{c.justification.slice(0, 90)}…</summary>
											<pre>{c.justification}</pre>
										</details>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
			{integ?.ran && (
				<>
					<h2>
						Real-integration bonus tier <span className="badge ok">ran</span>
					</h2>
					<table>
						<thead>
							<tr>
								<th>Fixture</th>
								<th>Dispatched</th>
								<th>Workspace</th>
								<th>Agent run</th>
								<th>Handoff</th>
							</tr>
						</thead>
						<tbody>
							{integ.fixtures.map((f) => (
								<tr key={f.fixtureId}>
									<td className="mono">{f.fixtureId}</td>
									<td>{f.dispatched ? "✅" : "❌"}</td>
									<td>{f.workspaceCreated ? "✅" : "❌"}</td>
									<td>{f.agentRunCompleted ? "✅" : "❌"}</td>
									<td>{f.handoffReached ? "✅" : "❌"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
			{t.provenance.notes.length > 0 && (
				<>
					<h2>Notes</h2>
					<ul>
						{t.provenance.notes.map((n, i) => (
							<li key={`${i}-${n.slice(0, 12)}`} className="muted mono">
								{n}
							</li>
						))}
					</ul>
				</>
			)}
		</>
	);
}

/* ------------------------------------------------------------------- router */

function App() {
	const path = window.location.pathname;
	const trial = path.match(/^\/runs\/([^/]+)\/trials\/([^/]+)$/);
	if (trial?.[1] && trial[2])
		return <TrialView runId={trial[1]} trialId={trial[2]} />;
	const run = path.match(/^\/runs\/([^/]+)$/);
	if (run?.[1]) return <RunView runId={run[1]} />;
	return <Leaderboard />;
}

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
