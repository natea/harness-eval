import { ChevronRight, FileText } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type {
	CandidateScore,
	StepResult,
	TrialResult,
	Weights,
} from "../../types";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../components/ui/tooltip";
import { DEFAULT_WEIGHTS, DIM_LABELS, reweight, useFetch } from "../lib/api";
import { Markdown, YamlBlock } from "../lib/markdown";
import { cn } from "../lib/utils";
import {
	btn,
	Callout,
	ColHead,
	DIM_KEYS,
	fmtDim,
	fmtMin,
	fmtUsd,
	OutcomeIcon,
	PageHeader,
	SectionTitle,
	WeightControls,
} from "./shared";

interface RunResults {
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
}

interface RunTarget {
	name: string;
	title: string;
	steps: Record<string, string>;
}

/* ------------------------------------------------------------------------- */
/* Trace model: only timing that is actually recorded.                        */
/* setup = telemetry.setupDurationMs, sessions = SessionRecord.durationMs in   */
/* order, wrap-up = whatever remains of provenance start→end. Grading runs     */
/* post-hoc with no timestamps, so it is shown as untimed evidence.           */
/* ------------------------------------------------------------------------- */

type SpanKind = "setup" | "session" | "wrapup";
interface Span {
	kind: SpanKind;
	label: string;
	start: number; // ms from trial start
	dur: number;
	sessionIndex?: number;
}
interface Trace {
	idx: number;
	/** 1-based attempt number when the same trial id was retried in this run. */
	attempt: number;
	attempts: number;
	trial: TrialResult;
	id: string;
	startAbs: number;
	total: number;
	spans: Span[];
}

function sessionLabel(t: TrialResult, i: number): string {
	const p = t.provenance.sessionScript[i]?.prompt ?? "";
	const first = p.trim().split(/\s+/)[0] ?? "";
	return first.startsWith("/") ? first : `Session ${i + 1}`;
}

function buildTrace(t: TrialResult, idx: number): Trace {
	const startAbs = Date.parse(t.provenance.startedAt);
	const endAbs = t.provenance.endedAt
		? Date.parse(t.provenance.endedAt)
		: Date.now();
	const total = Math.max(0, endAbs - startAbs);
	const spans: Span[] = [];
	let x = 0;
	const tel = t.telemetry;
	if (tel) {
		if (tel.setupDurationMs > 0) {
			spans.push({
				kind: "setup",
				label: "Setup",
				start: 0,
				dur: tel.setupDurationMs,
			});
			x = tel.setupDurationMs;
		}
		tel.sessions.forEach((s, i) => {
			spans.push({
				kind: "session",
				label: sessionLabel(t, s.stepIndex ?? i),
				start: x,
				dur: s.durationMs,
				sessionIndex: i,
			});
			x += s.durationMs;
		});
		if (total - x > 1000)
			spans.push({
				kind: "wrapup",
				label: "Archive & teardown",
				start: x,
				dur: total - x,
			});
	}
	return {
		idx,
		attempt: 1,
		attempts: 1,
		trial: t,
		id: t.provenance.trialId,
		startAbs,
		total,
		spans,
	};
}

function niceStep(range: number): number {
	const steps = [
		60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000,
		10_800_000, 21_600_000,
	];
	return steps.find((s) => range / s <= 8) ?? 43_200_000;
}

const outcomeColor: Record<StepResult["outcome"], string> = {
	pass: "bg-success-mark",
	partial: "bg-warn-mark",
	fail: "bg-danger-mark",
};

type Selection =
	| { type: "trial"; idx: number }
	| { type: "span"; idx: number; span: number }
	| { type: "step"; idx: number; stepId: string };

function TraceWaterfall({
	traces,
	steps,
	sel,
	onSelect,
}: {
	traces: Trace[];
	steps: Record<string, string>;
	sel: Selection | null;
	onSelect: (s: Selection) => void;
}) {
	const [mode, setMode] = useState<"aligned" | "wall">("aligned");
	const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
	const runStart = Math.min(...traces.map((t) => t.startAbs));
	const range =
		mode === "aligned"
			? Math.max(1, ...traces.map((t) => t.total))
			: Math.max(1, ...traces.map((t) => t.startAbs + t.total - runStart));
	const step = niceStep(range);
	const ticks: number[] = [];
	for (let v = 0; v <= range; v += step) ticks.push(v);
	const pct = (ms: number) => `${(ms / range) * 100}%`;
	const offset = (t: Trace) => (mode === "aligned" ? 0 : t.startAbs - runStart);
	const toggle = (i: number) =>
		setOpen((o) => {
			const n = new Set(o);
			n.has(i) ? n.delete(i) : n.add(i);
			return n;
		});

	const spanClass = (s: Span) =>
		s.kind === "session" ? "bg-primary" : "bg-span-setup";

	return (
		<Card className="overflow-hidden">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
				<div className="flex flex-wrap items-center gap-4 text-[12.5px] text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="h-2 w-4 rounded-sm bg-span-setup" />
						Setup / teardown
					</span>
					<span className="flex items-center gap-1.5">
						<span className="h-2 w-4 rounded-sm bg-primary" />
						Build session
					</span>
					<span className="flex items-center gap-1.5">
						<span className="flex gap-px">
							<span className="h-3 w-[3px] rounded-[1px] bg-success-mark" />
							<span className="h-3 w-[3px] rounded-[1px] bg-warn-mark" />
							<span className="h-3 w-[3px] rounded-[1px] bg-danger-mark" />
						</span>
						Plan steps (graded after, untimed)
					</span>
				</div>
				<fieldset
					aria-label="Time axis"
					className="m-0 min-w-0 inline-flex rounded-md border border-border p-0.5 text-[12.5px]"
				>
					{(
						[
							["aligned", "Aligned"],
							["wall", "Wall clock"],
						] as const
					).map(([k, l]) => (
						<button
							key={k}
							type="button"
							aria-pressed={mode === k}
							onClick={() => setMode(k)}
							className={cn(
								"h-6 rounded-[5px] px-2.5 font-medium text-muted-foreground",
								mode === k && "bg-secondary text-foreground",
							)}
						>
							{l}
						</button>
					))}
				</fieldset>
			</div>

			<div className="overflow-x-auto">
				<div className="min-w-[760px]">
					{/* axis */}
					<div className="grid grid-cols-[270px_minmax(0,1fr)_170px] border-b border-border text-[11px] text-muted-foreground">
						<span className="px-5 py-2 font-medium">Trial</span>
						<div className="relative h-8">
							{ticks.map((v) => (
								<span
									key={v}
									className="absolute top-2 -translate-x-1/2 font-mono first:translate-x-0"
									style={{ left: pct(v) }}
								>
									{fmtMin(v)}
								</span>
							))}
						</div>
						<span className="px-4 py-2 font-medium">Graded</span>
					</div>

					{traces.map((t) => {
						const g = t.trial.grades;
						const isOpen = open.has(t.idx);
						const status = t.trial.provenance.status;
						const failed = status !== "completed";
						const trialSel = sel && sel.idx === t.idx;
						return (
							<Fragment key={`${t.id}-${t.idx}`}>
								<div
									className={cn(
										"grid grid-cols-[270px_minmax(0,1fr)_170px] items-center border-b border-border transition-colors",
										trialSel ? "bg-primary-soft/60" : "hover:bg-muted/60",
									)}
								>
									<div className="flex min-w-0 items-center gap-1.5 py-2.5 pl-2 pr-3">
										<button
											type="button"
											aria-expanded={isOpen}
											aria-label={`${isOpen ? "Collapse" : "Expand"} ${t.id}`}
											onClick={() => toggle(t.idx)}
											disabled={t.spans.length === 0}
											className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:invisible"
										>
											<ChevronRight
												className={cn(
													"size-3.5 transition-transform",
													isOpen && "rotate-90",
												)}
											/>
										</button>
										<button
											type="button"
											onClick={() => onSelect({ type: "trial", idx: t.idx })}
											className="min-w-0 text-left"
										>
											<span className="block truncate font-mono text-[12.5px] font-medium">
												{t.id}
											</span>
											<span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
												{t.attempts > 1 && <span>Attempt {t.attempt} ·</span>}
												{failed ? (
													<Badge
														variant={
															status === "infra-failed" ? "danger" : "warn"
														}
													>
														{status}
													</Badge>
												) : (
													<>
														{fmtMin(t.total)} ·{" "}
														{fmtUsd(t.trial.telemetry?.totalCostUsd)}
													</>
												)}
											</span>
										</button>
									</div>
									<div className="relative h-11">
										{ticks.map((v) => (
											<span
												key={v}
												className="absolute inset-y-0 w-px bg-border/70"
												style={{ left: pct(v) }}
											/>
										))}
										{t.spans.length === 0 ? (
											<span
												className="absolute top-1/2 h-3 w-[3px] -translate-y-1/2 rounded-[1px] bg-danger-mark"
												style={{ left: pct(offset(t)) }}
												title={`${status} after ${fmtMin(t.total)}`}
											/>
										) : (
											t.spans.map((s, si) => (
												<button
													key={`${s.kind}-${s.start}`}
													type="button"
													onClick={() =>
														onSelect({ type: "span", idx: t.idx, span: si })
													}
													title={`${s.label} · ${fmtMin(s.dur)}`}
													className={cn(
														"absolute top-1/2 h-3 -translate-y-1/2 border-r border-card first:rounded-l-[3px] last:rounded-r-[3px] last:border-r-0",
														spanClass(s),
														sel?.type === "span" &&
															sel.idx === t.idx &&
															sel.span === si &&
															"ring-2 ring-ring ring-offset-1 ring-offset-card",
													)}
													style={{
														left: pct(offset(t) + s.start),
														width: `max(2px, ${pct(s.dur)})`,
													}}
												/>
											))
										)}
									</div>
									<div className="flex items-center gap-2.5 px-3">
										{g?.adherence ? (
											<>
												<span className="w-7 shrink-0 text-right font-mono text-[13px] font-semibold">
													{g.adherence.gradedScore.toFixed(0)}
												</span>
												<fieldset
													className="m-0 min-w-0 flex h-4 items-center gap-px"
													aria-label="Plan step outcomes"
												>
													{g.adherence.stepResults.map((s) => (
														<button
															key={s.stepId}
															type="button"
															aria-label={`${s.stepId} ${s.outcome}`}
															title={`${s.stepId} · ${s.outcome}${steps[s.stepId] ? ` — ${steps[s.stepId]}` : ""}`}
															onClick={() =>
																onSelect({
																	type: "step",
																	idx: t.idx,
																	stepId: s.stepId,
																})
															}
															className={cn(
																"h-4 w-[3px] shrink-0 rounded-[1px] transition-transform hover:scale-y-125",
																outcomeColor[s.outcome],
																sel?.type === "step" &&
																	sel.idx === t.idx &&
																	sel.stepId === s.stepId &&
																	"outline outline-2 outline-offset-1 outline-ring",
															)}
														/>
													))}
												</fieldset>
											</>
										) : (
											<span className="text-[12.5px] text-muted-foreground">
												{failed ? "Not graded" : "Awaiting grading"}
											</span>
										)}
									</div>
								</div>

								{isOpen &&
									t.spans.map((s, si) => (
										<div
											key={`${t.id}-${t.idx}-row-${s.kind}-${s.start}`}
											className="grid grid-cols-[270px_minmax(0,1fr)_170px] items-center border-b border-border/70 bg-muted/30 text-[12.5px]"
										>
											<button
												type="button"
												onClick={() =>
													onSelect({ type: "span", idx: t.idx, span: si })
												}
												className="flex min-w-0 items-baseline gap-2 py-1.5 pl-10 pr-3 text-left"
											>
												<span className="truncate font-mono">{s.label}</span>
												<span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
													{fmtMin(s.dur)}
												</span>
											</button>
											<div className="relative h-7">
												<span
													className={cn(
														"absolute top-1/2 h-2 -translate-y-1/2 rounded-[2px]",
														spanClass(s),
													)}
													style={{
														left: pct(offset(t) + s.start),
														width: `max(2px, ${pct(s.dur)})`,
													}}
												/>
											</div>
											<span className="px-4 font-mono text-[11.5px] text-muted-foreground">
												{s.kind === "session" && t.trial.telemetry
													? (() => {
															const r =
																t.trial.telemetry.sessions[s.sessionIndex ?? 0];
															return r
																? `${r.numTurns} turns · ${fmtUsd(r.costUsd)}`
																: "";
														})()
													: ""}
											</span>
										</div>
									))}
							</Fragment>
						);
					})}
				</div>
			</div>
			<p className="m-0 border-t border-border px-5 py-2.5 text-[12px] text-muted-foreground">
				{mode === "aligned"
					? "Each trial starts at zero so durations compare directly."
					: "Real start times, so concurrency and gaps between trials are visible."}{" "}
				Grading has no timestamps and is shown as outcomes, not time.
			</p>
		</Card>
	);
}

function DetailPanel({
	runId,
	traces,
	sel,
	steps,
}: {
	runId: string;
	traces: Trace[];
	sel: Selection | null;
	steps: Record<string, string>;
}) {
	const t = traces.find((x) => x.idx === (sel?.idx ?? 0)) ?? traces[0];
	if (!t) return null;
	const tr = t.trial;
	const p = tr.provenance;
	const tel = tr.telemetry;
	const link = (
		<a
			href={`/runs/${runId}/trials/${t.id}`}
			className={`${btn.secondary} w-full justify-center`}
		>
			Open trial
		</a>
	);
	const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
		<>
			<dt className="text-muted-foreground">{k}</dt>
			<dd className="m-0 min-w-0 truncate text-right font-mono text-[12.5px]">
				{v}
			</dd>
		</>
	);

	if (sel?.type === "step") {
		const s = tr.grades?.adherence?.stepResults.find(
			(x) => x.stepId === sel.stepId,
		);
		if (s) {
			const others = traces.filter(
				(o) => o.idx !== t.idx && o.trial.grades?.adherence,
			);
			return (
				<Card className="grid gap-4 p-5">
					<div>
						<span className="text-[12px] font-medium text-muted-foreground">
							{t.id} · plan step
						</span>
						<h3 className="m-0 mt-1 text-[16px] font-semibold leading-snug">
							<span className="font-mono">{s.stepId}</span>
							{steps[s.stepId] ? ` · ${steps[s.stepId]}` : ""}
						</h3>
					</div>
					<span className="flex items-center gap-2 text-[13px] font-medium">
						<OutcomeIcon o={s.outcome} />
						{s.outcome} · credit {s.credit}
					</span>
					<div>
						<div className="mb-1.5 text-[12px] font-medium text-muted-foreground">
							What the evaluator observed
						</div>
						<pre className="m-0 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[12px] leading-relaxed">
							{s.evidence}
						</pre>
					</div>
					{others.length > 0 && (
						<div>
							<div className="mb-1.5 text-[12px] font-medium text-muted-foreground">
								Same step in other trials
							</div>
							<dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[12.5px]">
								{others.map((o) => {
									const os = o.trial.grades?.adherence?.stepResults.find(
										(x) => x.stepId === s.stepId,
									);
									return (
										<Fragment key={`${o.id}-${o.idx}`}>
											<dt className="truncate font-mono">{o.id}</dt>
											<dd className="m-0 flex items-center gap-1.5">
												{os ? <OutcomeIcon o={os.outcome} /> : "—"}
												{os?.outcome}
											</dd>
										</Fragment>
									);
								})}
							</dl>
						</div>
					)}
					{link}
				</Card>
			);
		}
	}

	if (sel?.type === "span") {
		const s = t.spans[sel.span];
		const rec =
			s?.kind === "session" && tel
				? tel.sessions[s.sessionIndex ?? 0]
				: undefined;
		if (s)
			return (
				<Card className="grid gap-4 p-5">
					<div>
						<span className="text-[12px] font-medium text-muted-foreground">
							{t.id} · span
						</span>
						<h3 className="m-0 mt-1 font-mono text-[16px] font-semibold">
							{s.label}
						</h3>
					</div>
					<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
						<Row k="Duration" v={fmtMin(s.dur)} />
						<Row k="Starts at" v={`+${fmtMin(s.start)}`} />
						{rec && (
							<>
								<Row k="Turns" v={rec.numTurns} />
								<Row k="Cost" v={fmtUsd(rec.costUsd)} />
								<Row
									k="Output tokens"
									v={rec.usage.outputTokens.toLocaleString()}
								/>
								<Row
									k="Cache reads"
									v={rec.usage.cacheReadTokens.toLocaleString()}
								/>
								<Row k="Errored" v={rec.isError ? "yes" : "no"} />
							</>
						)}
					</dl>
					{s.kind === "session" && (
						<div>
							<div className="mb-1.5 text-[12px] font-medium text-muted-foreground">
								Prompt sent
							</div>
							<pre className="m-0 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[12px] leading-relaxed">
								{p.sessionScript[s.sessionIndex ?? 0]?.prompt ?? "—"}
							</pre>
						</div>
					)}
					{s.kind === "setup" && (
						<p className="m-0 text-[12.5px] text-muted-foreground">
							Sandbox provisioning and framework install. Excluded from agent
							working time.
						</p>
					)}
					{link}
				</Card>
			);
	}

	const g = tr.grades;
	return (
		<Card className="grid gap-4 p-5">
			<div>
				<span className="text-[12px] font-medium text-muted-foreground">
					Trial
				</span>
				<h3 className="m-0 mt-1 font-mono text-[16px] font-semibold">{t.id}</h3>
				<p className="m-0 mt-1 text-[12.5px] text-muted-foreground">
					{p.candidate} {p.candidateVersion} · {p.harness} {p.harnessVersion}
				</p>
			</div>
			{p.status !== "completed" && (
				<Callout title={p.status} tone="danger">
					{p.notes[0] ?? "Infra failures are retried and never graded."}
				</Callout>
			)}
			<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
				<Row
					k="Adherence"
					v={g?.adherence ? g.adherence.gradedScore.toFixed(1) : "—"}
				/>
				<Row
					k="Code quality"
					v={g?.quality ? g.quality.score.toFixed(0) : "—"}
				/>
				<Row k="Wall time" v={fmtMin(t.total)} />
				<Row k="Agent time" v={tel ? fmtMin(tel.agentDurationMs) : "—"} />
				<Row k="Turns" v={tel?.totalTurns ?? "—"} />
				<Row k="Cost" v={fmtUsd(tel?.totalCostUsd)} />
				<Row k="Provider" v={p.provider} />
				<Row k="Model" v={p.model} />
			</dl>
			<p className="m-0 text-[12px] text-muted-foreground">
				Select a span for its timing, or a step mark for the evaluator's
				evidence.
			</p>
			{link}
		</Card>
	);
}

/** Step × trial matrix (adherence test plan across trials). */
function StepMatrix({
	traces,
	steps,
	onSelect,
}: {
	traces: Trace[];
	steps: Record<string, string>;
	onSelect: (s: Selection) => void;
}) {
	const graded = traces.filter((t) => t.trial.grades?.adherence);
	if (graded.length < 2) return null;
	const stepIds = [
		...new Set(
			graded.flatMap((t) =>
				(t.trial.grades?.adherence?.stepResults ?? []).map((s) => s.stepId),
			),
		),
	];
	return (
		<section>
			<SectionTitle aside="Same frozen test plan, every graded trial">
				Step comparison
			</SectionTitle>
			<Card className="overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="pl-5">Step</TableHead>
							{graded.map((t) => (
								<TableHead
									key={`${t.id}-${t.idx}`}
									className="text-center font-mono text-[12px]"
								>
									{t.trial.provenance.candidate}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{stepIds.map((id) => (
							<TableRow key={id}>
								<TableCell className="max-w-[420px] py-2 pl-5">
									<span className="font-mono text-[12.5px] font-medium">
										{id}
									</span>
									{steps[id] && (
										<span className="ml-2 text-[13px] text-muted-foreground">
											{steps[id]}
										</span>
									)}
								</TableCell>
								{graded.map((t) => {
									const s = t.trial.grades?.adherence?.stepResults.find(
										(x) => x.stepId === id,
									);
									return (
										<TableCell
											key={`${t.id}-${t.idx}`}
											className="py-2 text-center"
										>
											{s ? (
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															onClick={() =>
																onSelect({
																	type: "step",
																	idx: t.idx,
																	stepId: id,
																})
															}
															className="inline-grid size-6 place-items-center rounded hover:bg-secondary"
														>
															<OutcomeIcon o={s.outcome} />
														</button>
													</TooltipTrigger>
													<TooltipContent>
														{s.outcome} · credit {s.credit}
													</TooltipContent>
												</Tooltip>
											) : (
												<span className="text-muted-foreground">·</span>
											)}
										</TableCell>
									);
								})}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Card>
		</section>
	);
}

interface LiveJob {
	runId: string;
	kind: "dry" | "live";
	status: string;
	stage?: string;
	startedAt: string;
	candidates: string[];
	trials: Record<string, string>; // trialId -> status
	costUsdSoFar: number;
}

/** A run that's still building/grading (not yet archived): live stage + trial links. */
function LiveRunView({
	runId,
	job,
	target,
}: {
	runId: string;
	job: LiveJob;
	target?: RunTarget;
}) {
	// Prefer the concrete per-trial ids the worker has registered; before any
	// exist, derive the t1 ids from the candidate list so the links still resolve.
	const trialIds = Object.keys(job.trials).length
		? Object.keys(job.trials)
		: job.candidates.map((c) => `${c}-t1`);
	return (
		<>
			<PageHeader
				back={{ href: "/runs", label: "Runs" }}
				title={target?.title ?? "Run in progress"}
				description={
					<span className="flex flex-wrap items-center gap-2">
						<span className="relative flex size-2">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
							<span className="relative inline-flex size-2 rounded-full bg-primary" />
						</span>
						{job.status}
						{job.stage ? ` · ${job.stage}` : ""} ·{" "}
						<span className="font-mono">{fmtUsd(job.costUsdSoFar)}</span> spent
						· <span className="font-mono">{runId}</span>
					</span>
				}
			/>
			<Card className="overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="pl-5">Trial</TableHead>
							<TableHead className="pr-5">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{trialIds.map((id) => (
							<TableRow key={id}>
								<TableCell className="pl-5">
									<a
										href={`/runs/${runId}/trials/${id}`}
										className="font-mono text-[13px] text-foreground no-underline hover:underline"
									>
										{id}
									</a>
								</TableCell>
								<TableCell className="pr-5 text-muted-foreground">
									{job.trials[id] ?? "pending"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Card>
		</>
	);
}

interface RunPrd {
	name: string | null;
	title: string | null;
	prd: string | null;
	testPlan: string | null;
	sha: string;
	currentMatch: boolean;
}

/** The input spec a run was graded against (input-spec-viewer): the PRD rendered
 *  as Markdown and the test plan as syntax-coloured YAML. */
function SpecPanel({ runId }: { runId: string }) {
	const data = useFetch<RunPrd>(`/api/runs/${runId}/prd`);
	if (!data) return null;
	return (
		<details className="group rounded-lg border border-border bg-card">
			<summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-[13.5px] font-medium">
				<FileText className="size-4 text-muted-foreground" />
				Spec the agents were asked to build
				<ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
			</summary>
			<div className="border-t border-border px-5 py-4">
				{!data.currentMatch || !data.prd ? (
					<p className="m-0 text-[13px] text-muted-foreground">
						The frozen PRD for this run is not available. Its hash (
						<span className="font-mono">{data.sha.slice(0, 12)}…</span>) matches
						no current target, because the target was re-frozen after this run
						and only the hash is archived.
					</p>
				) : (
					<>
						<div className="text-[12px] text-muted-foreground">
							PRD.md · {data.name}
						</div>
						<div className="mt-1 max-h-[480px] overflow-auto rounded-md bg-muted p-4">
							<Markdown source={data.prd} />
						</div>
						{data.testPlan && (
							<>
								<div className="mt-4 text-[12px] text-muted-foreground">
									testplan.yaml
								</div>
								<YamlBlock
									source={data.testPlan}
									className="mt-1 max-h-[360px]"
								/>
							</>
						)}
					</>
				)}
			</div>
		</details>
	);
}

/** "Jun 9 20:51 – 03:21" (same day) or "Jun 9 20:51 – Jun 10 03:21". */
function fmtSpan(a: string, b: string | null): string {
	const d = (iso: string) => new Date(iso);
	const day = (x: Date) =>
		x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	const time = (x: Date) =>
		x.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	const s = d(a);
	if (!b) return `${day(s)} ${time(s)} – running`;
	const e = d(b);
	return day(s) === day(e)
		? `${day(s)} ${time(s)} – ${time(e)}`
		: `${day(s)} ${time(s)} – ${day(e)} ${time(e)}`;
}

export function RunView({ runId }: { runId: string }) {
	const entry = useFetch<{
		supported: boolean;
		error?: string;
		results?: RunResults;
	}>(`/api/runs/${runId}`);
	const target = useFetch<RunTarget>(`/api/runs/${runId}/target`);
	// This session's live jobs — a run that's still building/grading isn't on disk
	// yet, so /api/runs 404s. Fall back to the queue so the run page shows live
	// progress (and links into each trial) instead of "unsupported / not found".
	const queue = useFetch<LiveJob[]>("/api/queue");
	const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
	const [sel, setSel] = useState<Selection | null>(null);
	const traces = useMemo(() => {
		const ts = (entry?.results?.trials ?? []).map((t, i) => buildTrace(t, i));
		const seen = new Map<string, number>();
		for (const t of ts) {
			const n = (seen.get(t.id) ?? 0) + 1;
			seen.set(t.id, n);
			t.attempt = n;
		}
		for (const t of ts) t.attempts = seen.get(t.id) ?? 1;
		return ts;
	}, [entry]);
	if (!entry)
		return <p className="text-[13px] text-muted-foreground">Loading run…</p>;
	if (!entry.supported || !entry.results) {
		const job = queue?.find((q) => q.runId === runId);
		if (job && (job.status === "running" || job.status === "queued"))
			return <LiveRunView runId={runId} job={job} target={target} />;
		return (
			<>
				<PageHeader
					back={{ href: "/runs", label: "Runs" }}
					title="Run unavailable"
				/>
				<Callout title="This run can't be shown." tone="danger">
					{entry.error ?? "No results were found for it."}
				</Callout>
			</>
		);
	}
	const r = entry.results;
	const rows = reweight(r.scores, weights);
	const combined = runId.startsWith("combined:");
	const steps = target?.steps ?? {};
	const totalCost = r.trials.reduce(
		(a, t) => a + (t.telemetry?.totalCostUsd ?? 0),
		0,
	);
	const [first, second] = rows;

	return (
		<>
			<PageHeader
				back={{ href: "/runs", label: "Runs" }}
				title={target?.title ?? (combined ? "Combined run" : "Run")}
				description={
					<>
						{String(r.config.harness)} · {String(r.config.model)} on{" "}
						{String(r.config.provider)} · judge {String(r.config.judgeModel)} ·{" "}
						{fmtSpan(r.startedAt, r.endedAt)}
					</>
				}
				actions={
					<>
						<span className="inline-flex h-8 items-center rounded-md border border-border px-2.5 font-mono text-[12px] text-muted-foreground">
							{runId.length > 34 ? `${runId.slice(0, 34)}…` : runId}
						</span>
						<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px]">
							<span className="text-muted-foreground">Trials</span>
							<span className="font-mono font-medium">
								n={String(r.config.trialsPerCandidate ?? "?")}
							</span>
						</span>
						<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px]">
							<span className="text-muted-foreground">Spend</span>
							<span className="font-mono font-medium">{fmtUsd(totalCost)}</span>
						</span>
					</>
				}
			/>

			<div className="grid grid-cols-1 gap-6">
				{!r.inconclusive &&
					first &&
					second &&
					rows.every((x) => x.trialsCounted < 2) && (
						<Callout title="One trial per framework.">
							This order comes from a single trial each and is not separable
							yet. Re-run with 3+ trials per framework before treating it as a
							result.
						</Callout>
					)}
				{r.inconclusive && first && second && (
					<Callout title="Ordering inconclusive.">
						{first.candidate} and {second.candidate} have overlapping composite
						ranges. Add trials before treating this order as a result.
					</Callout>
				)}

				<Card className="overflow-hidden">
					<div className="px-5 pt-4">
						<SectionTitle
							aside={`${r.trials.length} trials · ${r.exclusions.length} excluded`}
						>
							Standings
						</SectionTitle>
					</div>
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="w-10 pl-5">#</TableHead>
								<TableHead>Framework</TableHead>
								<ColHead label="Composite" className="text-right" />
								{Object.values(DIM_LABELS).map((l) => (
									<ColHead key={l} label={l} className="text-right" />
								))}
								<TableHead className="text-right">±σ</TableHead>
								<ColHead label="Trials" className="pr-5 text-right" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((s, i) => (
								<TableRow key={`${s.candidate}|${s.harness}|${s.model}`}>
									<TableCell className="pl-5 font-mono text-[12.5px] text-muted-foreground">
										{i + 1}
									</TableCell>
									<TableCell className="whitespace-nowrap font-medium">
										<span className="flex items-center gap-2">
											{s.candidate}
											{s.rightCensored && <Badge variant="warn">capped</Badge>}
										</span>
									</TableCell>
									<TableCell className="text-right font-mono text-[13.5px] font-semibold">
										{s.rw.toFixed(1)}
									</TableCell>
									{DIM_KEYS.map((k) => (
										<TableCell
											key={k}
											className="text-right font-mono text-[13px] text-muted-foreground"
										>
											{fmtDim(k, s.dimensions[k])}
										</TableCell>
									))}
									<TableCell className="text-right font-mono text-[13px] text-muted-foreground">
										{s.trialsCounted < 2
											? "—"
											: s.compositeStats.stddev.toFixed(1)}
									</TableCell>
									<TableCell className="pr-5 text-right font-mono text-[13px] text-muted-foreground">
										{s.trialsCounted}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					<WeightControls inline weights={weights} onChange={setWeights} />
				</Card>

				<section>
					<SectionTitle aside="Click a trial, span or step mark for details">
						Trial traces
					</SectionTitle>
					<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
						<div className="min-w-0">
							<TraceWaterfall
								traces={traces}
								steps={steps}
								sel={sel}
								onSelect={setSel}
							/>
						</div>
						<div className="xl:sticky xl:top-8 xl:self-start">
							<DetailPanel
								runId={runId}
								traces={traces}
								sel={sel}
								steps={steps}
							/>
						</div>
					</div>
				</section>

				<StepMatrix traces={traces} steps={steps} onSelect={setSel} />

				<SpecPanel runId={runId} />

				<section className="grid grid-cols-1 gap-6 md:grid-cols-2">
					<div>
						<SectionTitle>Provenance</SectionTitle>
						<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border bg-card p-5 text-[13px]">
							<dt className="text-muted-foreground">PRD</dt>
							<dd className="m-0 truncate font-mono text-[12.5px]">
								{r.prdSha256}
							</dd>
							<dt className="text-muted-foreground">Test plan</dt>
							<dd className="m-0 truncate font-mono text-[12.5px]">
								{r.testPlanSha256 ?? "n/a"}
							</dd>
							<dt className="text-muted-foreground">Judge</dt>
							<dd className="m-0 font-mono text-[12.5px]">
								{String(r.config.judgeModel)}
							</dd>
							<dt className="text-muted-foreground">Worker</dt>
							<dd className="m-0 font-mono text-[12.5px]">
								{String(r.config.harness)} / {String(r.config.model)}
							</dd>
						</dl>
					</div>
					{r.exclusions.length > 0 && (
						<div>
							<SectionTitle aside="Retried, never graded">
								Excluded trials
							</SectionTitle>
							<ul className="m-0 grid list-none gap-2 rounded-lg border border-border bg-card p-5 text-[13px]">
								{r.exclusions.map((e, i) => (
									<li key={`${i}-${e.trialId}`} className="grid gap-0.5">
										<span className="flex items-center gap-2">
											<span className="font-mono text-[12.5px]">
												{e.trialId}
											</span>
											<Badge variant="danger">{e.status}</Badge>
										</span>
										<span className="line-clamp-2 text-[12.5px] text-muted-foreground">
											{e.reason}
										</span>
									</li>
								))}
							</ul>
						</div>
					)}
				</section>
			</div>
		</>
	);
}
