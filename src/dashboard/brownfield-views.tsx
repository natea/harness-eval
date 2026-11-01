/**
 * Brownfield run/trial views, transcript view, and the theme toggle
 * (results-dashboard spec: brownfield views, transcript, light/dark theme).
 */
import React, { useEffect, useState } from "react";
import type { TrialResult } from "../types";
import { alignPatches, type FileDiff } from "./brownfield-diff";

function useJson<T>(url: string): T | undefined {
	const [data, setData] = useState<T>();
	useEffect(() => {
		fetch(url)
			.then((r) => r.json())
			.then((d) => setData(d as T))
			.catch(() => setData(undefined));
	}, [url]);
	return data;
}

/* ------------------------------------------------------------------ theme */

type Theme = "light" | "dark" | "system";
const THEME_KEY = "dashboard-theme";
const resolveDark = (t: Theme) =>
	t === "dark" ||
	(t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
const storedTheme = (): Theme => {
	const v = localStorage.getItem(THEME_KEY);
	return v === "light" || v === "dark" || v === "system" ? v : "system";
};

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>(storedTheme);
	useEffect(() => {
		document.documentElement.classList.toggle("dark", resolveDark(theme));
		localStorage.setItem(THEME_KEY, theme);
		if (theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () =>
			document.documentElement.classList.toggle("dark", resolveDark("system"));
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);
	const next: Theme =
		theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
	const icon = theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "🖥️";
	return (
		<button
			type="button"
			className="theme-toggle"
			onClick={() => setTheme(next)}
			title={`Theme: ${theme} — click for ${next}`}
			aria-label={`Theme: ${theme}, switch to ${next}`}
		>
			{icon} {theme}
		</button>
	);
}

/* ------------------------------------------------------------------ types */

interface TaskMeta {
	repo: string;
	taskId: string;
	title: string;
	pr: number;
	issues: number[];
	prUrl: string;
	issueUrls: string[];
	humanMinutes: number | null;
	humanReviewRounds: number | null;
	leakBody: string | null;
}
interface Activity {
	summary: string;
	engaged: boolean;
	noFramework: boolean;
	plugins: { name: string; version: string | null }[];
	available: string[];
	hookInjected: boolean;
	skillCalls: string[];
	commandsInvoked: string[];
	subagents: number;
	toolCounts: Record<string, number>;
}

function ActivityBadge({ a }: { a: Activity | null | undefined }) {
	if (!a) return <span className="muted">—</span>;
	if (a.noFramework) return <span className="badge">no framework</span>;
	return a.engaged ? (
		<span className="badge ok" title={a.summary}>
			engaged
		</span>
	) : (
		<span className="badge flag" title={a.summary}>
			not engaged
		</span>
	);
}

interface Row {
	trialId: string;
	candidate: string;
	status: string;
	variant: string;
	task: TaskMeta | null;
	verdict: string | null;
	reason: string | null;
	testInfraModified: string[];
	audit: string | null;
	quality: {
		harness: number;
		human: number;
		preference: string;
		votes: { harness: number; human: number; tie: number };
	} | null;
	signals: { candidateLines: number; humanLines: number; f1: number } | null;
	activity: Activity | null;
	minutes: number | null;
	costUsd: number | null;
	flags: string[];
}
interface QualityCriterion {
	criterion: string;
	label: string;
	harness: number;
	human: number;
	harnessSamples: number[];
	humanSamples: number[];
	notes: string[];
}
interface Artifacts {
	brownfield: {
		task: TaskMeta | null;
		candidatePatch: string | null;
		referencePatch: string | null;
		testsPatch: string | null;
		grade: {
			verdict: string;
			reason: string | null;
			failToPass: Record<string, string>;
			passToPass: Record<string, string>;
			testInfraModified: string[];
			cassetteMiss: string[];
		} | null;
		judge: {
			quality: string;
			resolvesIssue: boolean;
			notes: string;
			model?: string;
		} | null;
		signals: {
			localization: {
				matched: string[];
				missed: string[];
				extra: string[];
				f1: number;
			};
			diffSizeRatio: number;
		} | null;
		audit: { verdict: string; findings: unknown[]; attempts: unknown[] } | null;
		activity: Activity | null;
		quality: {
			judgeModel: string;
			samples: number;
			criteria: QualityCriterion[];
			harnessScore: number;
			humanScore: number;
			preference: string;
			votes: { harness: number; human: number; tie: number };
			rationales: string[];
			costUsd: number;
		} | null;
	} | null;
	transcript: string | null;
}

/* ------------------------------------------------------------ small parts */

const verdictBadge = (v: string | null, status?: string) =>
	status === "infra-failed" ? (
		<span className="badge warn">infra-failed</span>
	) : v === "resolved" ? (
		<span className="badge ok">resolved</span>
	) : v ? (
		<span className="badge flag">{v}</span>
	) : (
		<span className="muted">—</span>
	);

/** Harness PR vs the original PR (older quality.json files say "human"). */
const originalPrWording = (text: string) =>
	text
		.replace(/\bmerged human PR\b/gi, "original PR")
		.replace(/\bhuman PR's\b/gi, "original PR's")
		.replace(/\bhuman PR\b/gi, "original PR")
		.replace(/\bhuman's\b/gi, "original PR's")
		.replace(/\bhuman\b/gi, "original PR")
		.replace(/\bPR harness\b/g, "harness PR")
		.replace(/\bPR original PR\b/g, "original PR");

const prefLabel = (p: string) =>
	p === "harness" ? "harness" : p === "human" ? "original PR" : "tie";

function TaskLinks({ task }: { task: TaskMeta | null }) {
	if (!task) return <span className="muted">unknown task</span>;
	return (
		<>
			<a href={task.prUrl} target="_blank" rel="noreferrer">
				PR #{task.pr}
			</a>
			{task.issueUrls.map((u, i) => (
				<span key={u}>
					{" · "}
					<a href={u} target="_blank" rel="noreferrer">
						issue #{task.issues[i]}
					</a>
				</span>
			))}
		</>
	);
}

/* --------------------------------------------------------------- run view */

export function BrownfieldRunView({
	runId,
	results,
}: {
	runId: string;
	results: {
		config: Record<string, unknown>;
		trials: TrialResult[];
		startedAt: string;
	};
}) {
	const rows = useJson<Row[]>(`/api/runs/${runId}/brownfield`);
	const t0 = results.trials[0]?.provenance;
	const scored = rows?.filter((r) => r.status !== "infra-failed") ?? [];
	const resolved = scored.filter((r) => r.verdict === "resolved").length;
	const cost = (rows ?? []).reduce((s, r) => s + (r.costUsd ?? 0), 0);
	return (
		<>
			<p>
				<a href="/">← all runs</a>
			</p>
			<h1>
				{runId} <span className="badge ok">brownfield</span>
			</h1>
			<p className="mono muted">
				{t0?.brownfield?.repoDir.replace("__", "/")} · variant{" "}
				{t0?.brownfield?.variant} · model {t0?.model} · provider {t0?.provider}{" "}
				· started {results.startedAt}
			</p>
			<p>
				Resolved <strong>{resolved}</strong> of {scored.length} scored trial(s)
				{rows && rows.length > scored.length && (
					<span className="muted">
						{" "}
						· {rows.length - scored.length} infra-failed (not scored)
					</span>
				)}{" "}
				· 💵 ${cost.toFixed(2)} agent spend
			</p>
			<p className="muted">
				Each trial replays a real merged PR: the harness gets the issue as it
				stood before the fix, and is graded by the PR's hidden tests. Quality
				compares the harness's PR with the original PR that was merged (blind
				A/B judge, 0–100).
			</p>
			{!rows ? (
				<p className="muted">loading…</p>
			) : (
				<table>
					<thead>
						<tr>
							<th>Candidate</th>
							<th>Task</th>
							<th>Verdict</th>
							<th>Harness used</th>
							<th>Quality: harness vs original</th>
							<th>Lines: harness / original</th>
							<th>File overlap</th>
							<th>Agent vs original time</th>
							<th>Cost</th>
							<th>Flags</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.trialId}>
								<td>
									<a href={`/runs/${runId}/trials/${r.trialId}`}>
										{r.candidate}
									</a>
								</td>
								<td>
									<div>{r.task?.title ?? r.trialId}</div>
									<div className="mono muted">
										<TaskLinks task={r.task} />
									</div>
								</td>
								<td>
									{verdictBadge(r.verdict, r.status)}
									{r.reason && <div className="mono muted">{r.reason}</div>}
								</td>
								<td>
									<ActivityBadge a={r.activity} />
								</td>
								<td className="mono">
									{r.quality ? (
										<>
											<strong>{r.quality.harness}</strong> vs {r.quality.human}
											<div className="muted">
												prefers {prefLabel(r.quality.preference)} (
												{r.quality.votes.harness}/{r.quality.votes.human}/
												{r.quality.votes.tie})
											</div>
										</>
									) : (
										<span className="muted">not compared</span>
									)}
								</td>
								<td className="mono">
									{r.signals
										? `${r.signals.candidateLines} / ${r.signals.humanLines}`
										: "—"}
								</td>
								<td className="mono">
									{r.signals ? `F1 ${r.signals.f1.toFixed(2)}` : "—"}
								</td>
								<td className="mono">
									{r.minutes != null ? `${r.minutes.toFixed(1)}m` : "—"} /{" "}
									{r.task?.humanMinutes != null
										? `${Math.round(r.task.humanMinutes)}m`
										: "—"}
								</td>
								<td className="mono">
									{r.costUsd != null ? `$${r.costUsd.toFixed(2)}` : "—"}
								</td>
								<td>
									{r.testInfraModified.length > 0 && (
										<span
											className="badge warn"
											title={r.testInfraModified.join(", ")}
										>
											test files edited
										</span>
									)}
									{r.audit && r.audit !== "clean" && (
										<span className="badge flag">audit: {r.audit}</span>
									)}
									{r.flags.map((f) => (
										<span key={f} className="badge flag" title={f}>
											{f.split(":")[0]}
										</span>
									))}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</>
	);
}

/* -------------------------------------------------------------- diff view */

function DiffBlock({ patch, empty }: { patch: string | null; empty: string }) {
	if (!patch?.trim()) return <p className="muted">{empty}</p>;
	return (
		<pre className="diff">
			{patch.split("\n").map((l, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
					key={i}
					className={
						l.startsWith("diff --git")
							? "d-file"
							: l.startsWith("@@")
								? "d-hunk"
								: l.startsWith("+") && !l.startsWith("+++")
									? "d-add"
									: l.startsWith("-") && !l.startsWith("---")
										? "d-del"
										: undefined
					}
				>
					{l}
					{"\n"}
				</span>
			))}
		</pre>
	);
}

const STATUS_LABEL: Record<FileDiff["status"], string> = {
	added: "new file",
	deleted: "deleted",
	renamed: "renamed",
	modified: "modified",
};

function FileHeading({ path, note }: { path: string; note?: string }) {
	return (
		<h3 className="mono diff-path">
			{path} {note && <span className="badge">{note}</span>}
		</h3>
	);
}

/* ------------------------------------------------------------- transcript */

/** Minimal markdown: headings, fenced code, paragraphs. */
function MarkdownLite({ source }: { source: string }) {
	const out: React.ReactNode[] = [];
	const lines = source.split("\n");
	let i = 0;
	let k = 0;
	while (i < lines.length) {
		const line = lines[i] as string;
		if (line.startsWith("```")) {
			const body: string[] = [];
			i++;
			while (i < lines.length && !(lines[i] as string).startsWith("```"))
				body.push(lines[i++] as string);
			i++;
			out.push(<pre key={k++}>{body.join("\n")}</pre>);
			continue;
		}
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			const level = Math.min(6, (h[1] as string).length + 2);
			out.push(
				React.createElement(
					`h${level}`,
					{ key: k++, className: "t-head" },
					h[2],
				),
			);
			i++;
			continue;
		}
		const para: string[] = [];
		while (
			i < lines.length &&
			(lines[i] as string).trim() !== "" &&
			!(lines[i] as string).startsWith("```") &&
			!/^#{1,6}\s/.test(lines[i] as string)
		)
			para.push(lines[i++] as string);
		if (para.length)
			out.push(
				<p key={k++} className="t-para">
					{para.join("\n")}
				</p>,
			);
		else i++;
	}
	return <div className="transcript">{out}</div>;
}

export function TranscriptSection({
	runId,
	trialId,
}: {
	runId: string;
	trialId: string;
}) {
	const a = useJson<Artifacts>(
		`/api/runs/${runId}/trials/${trialId}/artifacts`,
	);
	if (!a) return null;
	return <Transcript text={a.transcript} />;
}

function Transcript({ text }: { text: string | null }) {
	return (
		<>
			<h2>Transcript</h2>
			{text ? (
				<details>
					<summary>
						show the full session ({text.length.toLocaleString()} characters)
					</summary>
					<MarkdownLite source={text} />
				</details>
			) : (
				<p className="muted">no transcript archived for this trial</p>
			)}
		</>
	);
}

/* ------------------------------------------------------------- trial view */

export function BrownfieldTrialView({
	runId,
	trialId,
	t,
}: {
	runId: string;
	trialId: string;
	t: TrialResult;
}) {
	const a = useJson<Artifacts>(
		`/api/runs/${runId}/trials/${trialId}/artifacts`,
	);
	const bf = a?.brownfield;
	const task = bf?.task;
	const q = bf?.quality;
	const g = bf?.grade;
	const aligned = alignPatches(
		bf?.candidatePatch,
		bf?.referencePatch,
		bf?.testsPatch,
	);
	return (
		<>
			<p>
				<a href={`/runs/${runId}`}>← {runId}</a>
			</p>
			<h1>
				{task?.title ?? trialId} <span className="badge ok">brownfield</span>
			</h1>
			<p className="mono muted">
				{t.provenance.candidate}@{t.provenance.candidateVersion} ·{" "}
				{t.provenance.harness} {t.provenance.harnessVersion} ·{" "}
				{t.provenance.model} · {t.provenance.provider} · variant{" "}
				{t.provenance.brownfield?.variant} · <TaskLinks task={task ?? null} />
			</p>
			{t.telemetry && (
				<p>
					⏱ {(t.telemetry.agentDurationMs / 60000).toFixed(1)}m agent
					{task?.humanMinutes != null && (
						<> (human: {Math.round(task.humanMinutes)}m)</>
					)}{" "}
					· 💵 ${t.telemetry.totalCostUsd.toFixed(2)} · {t.telemetry.totalTurns}{" "}
					turns
				</p>
			)}
			{!a ? (
				<p className="muted">loading…</p>
			) : (
				<>
					<h2>
						Harness activity: <ActivityBadge a={bf?.activity} />
					</h2>
					{bf?.activity ? (
						<>
							<p>{bf.activity.summary}</p>
							{!bf.activity.noFramework && (
								<p className="mono muted">
									commands scripted:{" "}
									{bf.activity.commandsInvoked.map((c) => `/${c}`).join(", ") ||
										"none"}{" "}
									· skills invoked:{" "}
									{bf.activity.skillCalls.join(", ") || "none"} · subagents:{" "}
									{bf.activity.subagents} · startup hook:{" "}
									{bf.activity.hookInjected ? "fired" : "no"}
								</p>
							)}
							<details>
								<summary>
									{bf.activity.available.length} framework skills/commands
									available · tool calls{" "}
									{Object.entries(bf.activity.toolCounts)
										.map(([k, v]) => `${k} ${v}`)
										.join(", ")}
								</summary>
								<p className="mono muted">
									{bf.activity.available.join(", ") || "none"}
								</p>
							</details>
						</>
					) : (
						<p className="muted">no session log archived</p>
					)}

					<h2>
						Hidden tests:{" "}
						{verdictBadge(g?.verdict ?? null, t.provenance.status)}{" "}
						{g?.reason && <span className="mono muted">{g.reason}</span>}
					</h2>
					{g && (
						<table>
							<thead>
								<tr>
									<th>Test</th>
									<th>Kind</th>
									<th>Outcome</th>
								</tr>
							</thead>
							<tbody>
								{Object.entries(g.failToPass).map(([k, v]) => (
									<tr key={`f-${k}`}>
										<td className="mono">{k}</td>
										<td>fail → pass</td>
										<td>
											{v === "pass" ? "✅" : "❌"} {v}
										</td>
									</tr>
								))}
								{Object.entries(g.passToPass).map(([k, v]) => (
									<tr key={`p-${k}`}>
										<td className="mono">{k}</td>
										<td>pass → pass</td>
										<td>
											{v === "pass" ? "✅" : "❌"} {v}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
					{g && g.testInfraModified.length > 0 && (
						<p>
							<span className="badge warn">test files edited</span> restored
							before grading:{" "}
							<span className="mono">{g.testInfraModified.join(", ")}</span>
						</p>
					)}

					<h2>
						Code quality vs the original PR{" "}
						{q && (
							<span className="muted">
								({q.judgeModel}, {q.samples} blind samples)
							</span>
						)}
					</h2>
					{q ? (
						<>
							<p>
								Harness <strong>{q.harnessScore}</strong> vs original PR{" "}
								<strong>{q.humanScore}</strong> · judge prefers{" "}
								<strong>{prefLabel(q.preference)}</strong> (votes harness{" "}
								{q.votes.harness} / original PR {q.votes.human} / tie{" "}
								{q.votes.tie})
							</p>
							<table>
								<thead>
									<tr>
										<th>Criterion</th>
										<th>Harness</th>
										<th>Original PR</th>
										<th>Judge's note</th>
									</tr>
								</thead>
								<tbody>
									{q.criteria.map((c) => (
										<tr key={c.criterion}>
											<td>{c.label}</td>
											<td
												className="mono"
												title={`samples ${c.harnessSamples.join(", ")}`}
											>
												{c.harness}
											</td>
											<td
												className="mono"
												title={`samples ${c.humanSamples.join(", ")}`}
											>
												{c.human}
											</td>
											<td>{originalPrWording(c.notes[0] ?? "")}</td>
										</tr>
									))}
								</tbody>
							</table>
							<p>
								<strong>Rationale:</strong>{" "}
								{originalPrWording(q.rationales[0] ?? "")}
							</p>
						</>
					) : (
						<p className="muted">
							not compared yet — run{" "}
							<span className="mono">
								bun run src/cli.ts brownfield quality runs/{runId} --judge
								&lt;profile&gt;
							</span>
						</p>
					)}
					{bf?.judge && (
						<p className="muted">
							Resolution judge ({bf.judge.model}): {bf.judge.quality},{" "}
							{bf.judge.resolvesIssue
								? "resolves the issue"
								: "does not resolve the issue"}{" "}
							— {bf.judge.notes}
						</p>
					)}

					<h2>Harness PR vs original PR</h2>
					{bf?.signals && (
						<p className="mono muted">
							files matched{" "}
							{bf.signals.localization.matched.join(", ") || "none"} · missed{" "}
							{bf.signals.localization.missed.join(", ") || "none"} · extra{" "}
							{bf.signals.localization.extra.join(", ") || "none"} · size ratio{" "}
							{bf.signals.diffSizeRatio.toFixed(2)}×
						</p>
					)}
					<div className="cols">
						<h3>Harness ({t.provenance.candidate})</h3>
						<h3>
							Original PR{" "}
							{task && (
								<a href={task.prUrl} target="_blank" rel="noreferrer">
									#{task.pr}
								</a>
							)}
						</h3>
					</div>
					{aligned.rows.length === 0 && (
						<p className="muted">no reference patch</p>
					)}
					{aligned.rows.map((r) => (
						<div key={r.path}>
							<FileHeading
								path={r.path}
								note={
									r.hiddenTest
										? "original's tests, hidden from the harness"
										: undefined
								}
							/>
							<div className="cols">
								<div>
									{r.harness ? (
										<DiffBlock patch={r.harness.text} empty="empty patch" />
									) : (
										<p className="muted">harness didn't change this file</p>
									)}
								</div>
								<div>
									<DiffBlock patch={r.original.text} empty="empty patch" />
								</div>
							</div>
						</div>
					))}
					{aligned.otherOriginalTests.length > 0 && (
						<details>
							<summary>
								other tests from the original PR (hidden from the harness)
							</summary>
							{aligned.otherOriginalTests.map((f) => (
								<div key={f.path}>
									<FileHeading path={f.path} />
									<DiffBlock patch={f.text} empty="empty patch" />
								</div>
							))}
						</details>
					)}
					<p className="muted">
						{aligned.harnessOnly.length > 0
							? `${aligned.harnessOnly.length} more file(s) only the harness changed are at the bottom of this page.`
							: "The harness changed no files beyond these."}
					</p>

					<h2>Audit</h2>
					<p>
						{bf?.audit ? (
							bf.audit.verdict === "clean" ? (
								<span className="badge ok">clean</span>
							) : (
								<span className="badge flag">{bf.audit.verdict}</span>
							)
						) : (
							<span className="muted">no audit</span>
						)}{" "}
						<span className="muted">
							— did the agent try to reach the upstream fix?
						</span>
					</p>
					<Transcript text={a.transcript} />
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
			{aligned.harnessOnly.length > 0 && (
				<>
					<h2>Files only the harness changed</h2>
					<p className="muted">The original PR did not change these files.</p>
					{aligned.harnessOnly.map((f) => (
						<div key={f.path}>
							<FileHeading path={f.path} note={STATUS_LABEL[f.status]} />
							<DiffBlock patch={f.text} empty="no text changes" />
						</div>
					))}
				</>
			)}
		</>
	);
}
