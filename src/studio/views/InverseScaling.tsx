import { Fragment, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";
import { useFetch } from "../lib/api";

// Type-only mirror of src/report/inverse-scaling.ts — NOT imported (that module
// pulls in node:fs and must not enter the browser bundle).
interface Cell {
	target: string;
	harness: string;
	model: string;
	framework: string;
	baselineCandidate: string;
	nF: number;
	adhF: number;
	nB: number;
	baselineAdh: number;
	adhGain: number;
	qualB: number | null;
	qualF: number | null;
	qualGain: number | null;
	flags: string[];
	runIds: string[];
	frameworkTrials: TrialRef[];
	baselineTrials: TrialRef[];
}
interface TrialRef {
	runId: string;
	trialId: string;
	candidate: string;
	adherence: number;
	quality: number | null;
}
interface Fit {
	slope: number;
	r: number;
	n: number;
}
interface InverseScaling {
	runsScanned: number;
	rows: Cell[];
	orphanFrameworks: string[];
	fits: {
		adherenceAll: Fit | null;
		qualityAll: Fit | null;
		perFramework: { framework: string; fit: Fit | null }[];
	};
}

const f1 = (v: number) => v.toFixed(1);

/** The headline metric: the baseline→framework change, made loud. Green up / red
 *  down / muted flat, with an arrow and the signed delta. */
function Delta({ v }: { v: number | null }) {
	if (v == null) return <span className="text-muted-foreground">—</span>;
	const flat = Math.abs(v) < 0.5;
	const cls = flat
		? "text-muted-foreground"
		: v > 0
			? "text-success"
			: "text-danger";
	const arrow = flat ? "→" : v > 0 ? "▲" : "▼";
	return (
		<span className={`font-mono text-base font-bold tabular-nums ${cls}`}>
			{arrow} {v > 0 ? "+" : ""}
			{f1(v)}
		</span>
	);
}

/** baseline value → framework value, with the loud delta beside it. */
function Move({
	base,
	fwk,
	delta,
}: {
	base: number | null;
	fwk: number | null;
	delta: number | null;
}) {
	return (
		<div className="flex items-center gap-2 whitespace-nowrap">
			<span className="font-mono text-[13px] text-muted-foreground tabular-nums">
				{base == null ? "—" : f1(base)}
				<span className="mx-1 opacity-50">→</span>
				<span className="text-foreground">{fwk == null ? "—" : f1(fwk)}</span>
			</span>
			<Delta v={delta} />
		</div>
	);
}

function FitBadge({ fit, axis }: { fit: Fit | null; axis: string }) {
	if (!fit)
		return (
			<Card>
				<CardContent className="p-3">
					<div className="text-[13px] font-semibold">{axis}</div>
					<div className="text-[13px] text-muted-foreground">
						no fit yet — needs ≥2 points with baseline-strength variance
					</div>
				</CardContent>
			</Card>
		);
	const inverse = fit.slope < 0;
	return (
		<Card>
			<CardContent className="p-3">
				<div className="flex items-center gap-2">
					<div className="text-[13px] font-semibold">{axis}</div>
					<Badge variant={inverse ? "ok" : "warn"}>
						{inverse ? "inverse-scaling" : "no inverse-scaling"}
					</Badge>
				</div>
				<div className="mt-1 font-mono text-[13px] tabular-nums">
					slope{" "}
					<span className={inverse ? "text-success" : "text-danger"}>
						{fit.slope.toFixed(2)}
					</span>{" "}
					gain-pts / +1 baseline-pt · r={fit.r.toFixed(2)} · n={fit.n}
				</div>
				<div className="mt-1 text-[12px] text-muted-foreground">
					{inverse
						? "gains are larger where the baseline model is weaker"
						: "gains track the baseline upward (not inverse-scaling)"}
				</div>
			</CardContent>
		</Card>
	);
}

/** One side of the drill-through: the individual graded trials behind a cell,
 *  each linking to its trial scorecard. */
function TrialList({
	heading,
	trials,
}: {
	heading: string;
	trials: TrialRef[];
}) {
	return (
		<div className="min-w-[16rem]">
			<div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				{heading}
			</div>
			{trials.length === 0 ? (
				<div className="text-[12px] text-muted-foreground">no trials</div>
			) : (
				<ul className="space-y-0.5">
					{trials.map((t) => {
						const label = `${t.runId} / ${t.trialId || "?"}`;
						const scores = (
							<span className="font-mono text-[11px] tabular-nums text-muted-foreground">
								adh {f1(t.adherence)}
								<span className="mx-1 opacity-50">·</span>
								qual {t.quality == null ? "—" : f1(t.quality)}
							</span>
						);
						return (
							<li
								key={`${t.runId}|${t.trialId}`}
								className="flex items-center gap-2"
							>
								{t.trialId ? (
									<a
										href={`/runs/${t.runId}/trials/${t.trialId}`}
										className="font-mono text-[12px] text-primary hover:underline"
									>
										{label}
									</a>
								) : (
									<span className="font-mono text-[12px] text-muted-foreground">
										{label}
									</span>
								)}
								{scores}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

export function InverseScaling() {
	const data = useFetch<InverseScaling>("/api/inverse-scaling");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const toggle = (key: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	if (!data) return <p className="text-muted-foreground">loading…</p>;
	// Be resilient to a stale/older endpoint payload (e.g. a studio server started
	// before a field was added): default every optional shape rather than crash.
	const rows = [...(data.rows ?? [])].sort(
		(a, b) =>
			a.target.localeCompare(b.target) ||
			a.framework.localeCompare(b.framework),
	);

	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">
				📉 Inverse-scaling — marginal harness gain
			</h1>
			<p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
				For each target × model, every framework is compared against the{" "}
				<span className="font-semibold">no-framework baseline</span> on the same
				harness. The numbers are the absolute graded scores; the bold colored
				delta is what a framework adds (or removes) over running bare — on
				adherence (does it meet the spec) and code quality.
				Composite/speed/spend are deliberately excluded (not comparable across
				runs).
			</p>

			<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
				<FitBadge fit={data.fits?.adherenceAll ?? null} axis="Adherence axis" />
				<FitBadge fit={data.fits?.qualityAll ?? null} axis="Quality axis" />
			</div>

			<Card className="mt-3">
				<CardContent className="px-2 pb-2 pt-2">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Target</TableHead>
								<TableHead>Framework</TableHead>
								<TableHead>Model</TableHead>
								<TableHead>Adherence (bare → framework)</TableHead>
								<TableHead>Code quality (bare → framework)</TableHead>
								<TableHead>n</TableHead>
								<TableHead>Flags</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r) => {
								const key = `${r.target}|${r.harness}|${r.model}|${r.framework}`;
								const isOpen = expanded.has(key);
								return (
								<Fragment key={key}>
								<TableRow
									onClick={() => toggle(key)}
									className="cursor-pointer"
									aria-expanded={isOpen}
									title="Click to see the trials behind this cell"
								>
									<TableCell className="font-mono text-[12px]">
										<span className="mr-1 inline-block w-3 text-muted-foreground">
											{isOpen ? "▾" : "▸"}
										</span>
										{r.target}
									</TableCell>
									<TableCell className="font-semibold">{r.framework}</TableCell>
									<TableCell className="font-mono text-[12px] text-muted-foreground">
										{r.model}
									</TableCell>
									<TableCell>
										<Move base={r.baselineAdh} fwk={r.adhF} delta={r.adhGain} />
									</TableCell>
									<TableCell>
										<Move base={r.qualB} fwk={r.qualF} delta={r.qualGain} />
									</TableCell>
									<TableCell
										className="font-mono text-[12px] text-muted-foreground"
										title={
											r.runIds?.length
												? `assembled from ${r.runIds.length} run(s):\n${r.runIds.join("\n")}`
												: undefined
										}
									>
										{r.nF} / {r.nB}
										{(r.runIds?.length ?? 0) > 1 && (
											<span className="ml-1 opacity-60" aria-hidden>
												⊕
											</span>
										)}
									</TableCell>
									<TableCell>
										{r.flags?.length ? (
											<Badge variant="warn">{r.flags.join(" ")}</Badge>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
								</TableRow>
								{isOpen && (
									<TableRow className="hover:bg-transparent">
										<TableCell colSpan={7} className="bg-secondary/40">
											<div className="flex flex-wrap gap-8 px-2 py-2">
												<TrialList
													heading={`Framework — ${r.framework}`}
													trials={r.frameworkTrials ?? []}
												/>
												<TrialList
													heading={`Baseline — ${r.baselineCandidate}`}
													trials={r.baselineTrials ?? []}
												/>
											</div>
										</TableCell>
									</TableRow>
								)}
								</Fragment>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<p className="mt-2 text-[12px] text-muted-foreground">
				{rows.length} complete cell(s) across {data.runsScanned ?? 0} runs · n
				shown as framework/baseline trials · ⊕ = assembled across multiple runs
				(hover for which) · <span className="text-warn">warn</span> flags mark
				thin (low-n) or unstable (high-σ) cells — read those deltas as
				directional, not precise. Gains are measured on the eval set, not
				held-out tasks (HarnessX §7.7).
			</p>
		</>
	);
}
