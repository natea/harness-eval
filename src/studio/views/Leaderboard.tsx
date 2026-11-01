import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { CandidateScore, Weights } from "../../types";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";
import {
	DEFAULT_WEIGHTS,
	DIM_LABELS,
	type RunSummary,
	reweight,
	useFetch,
} from "../lib/api";
import {
	btn,
	Callout,
	ColHead,
	CompositeChart,
	DIM_KEYS,
	fmtDim,
	fmtRunDate,
	fmtUsd,
	PageHeader,
	runTs,
	SectionTitle,
	WeightControls,
} from "./shared";

const RECENT = 6;
const ALL = "__all__";

type Row = {
	key: string;
	candidate: string;
	harness: string;
	model: string;
	composite: number;
	min: number;
	max: number;
	dims: Record<keyof Weights, number>;
	trials: number;
	runs: number;
	censored: boolean;
	costUsd: number | null;
};

export function Leaderboard() {
	const runs = useFetch<RunSummary[]>("/api/runs");
	const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
	const [target, setTarget] = useState<string | null>(null);

	const supported = useMemo(
		() =>
			(runs ?? [])
				.filter((r) => r.supported && r.summary)
				.sort((a, b) => (runTs(b.runId) ?? 0) - (runTs(a.runId) ?? 0)),
		[runs],
	);
	const targets = useMemo(() => {
		const m = new Map<string, string>();
		for (const r of supported) {
			const t = r.summary?.target;
			if (t) m.set(t.name, t.title);
		}
		return [...m.entries()];
	}, [supported]);

	if (!runs)
		return (
			<p className="text-[13px] text-muted-foreground">Loading results…</p>
		);

	// Default to the target of the most recent graded run: a ranking only means
	// something within one spec.
	const activeTarget =
		target ??
		supported.find((r) => r.summary?.target)?.summary?.target?.name ??
		ALL;
	const active = supported.filter(
		(r) => activeTarget === ALL || r.summary?.target?.name === activeTarget,
	);
	const targetTitle =
		activeTarget === ALL
			? "All targets"
			: (targets.find(([n]) => n === activeTarget)?.[1] ?? activeTarget);

	// Aggregate per candidate/harness/model: mean of per-run re-weighted composites.
	const byKey = new Map<
		string,
		{ rows: (CandidateScore & { rw: number })[]; runs: number }
	>();
	for (const r of active) {
		for (const s of reweight(r.summary?.scores ?? [], weights)) {
			const key = `${s.candidate}|${s.harness}|${s.model}`;
			const slot = byKey.get(key) ?? { rows: [], runs: 0 };
			slot.rows.push(s);
			slot.runs++;
			byKey.set(key, slot);
		}
	}
	const rows: Row[] = [...byKey.entries()]
		.map(([key, { rows: rs, runs: n }]) => {
			const mean = (f: (s: CandidateScore & { rw: number }) => number) =>
				rs.reduce((a, s) => a + f(s), 0) / rs.length;
			const [candidate = "", harness = "", model = ""] = key.split("|");
			// Range: spread of per-run composites widened by each run's trial spread.
			const lo = Math.min(
				...rs.map(
					(s) => s.rw - (s.compositeStats.max - s.compositeStats.min) / 2,
				),
			);
			const hi = Math.max(
				...rs.map(
					(s) => s.rw + (s.compositeStats.max - s.compositeStats.min) / 2,
				),
			);
			return {
				key,
				candidate,
				harness,
				model,
				composite: mean((s) => s.rw),
				min: lo,
				max: hi,
				dims: {
					prdAdherence: mean((s) => s.dimensions.prdAdherence),
					codeQuality: mean((s) => s.dimensions.codeQuality),
					speed: mean((s) => s.dimensions.speed),
					tokenSpend: mean((s) => s.dimensions.tokenSpend),
				},
				trials: rs.reduce((a, s) => a + s.trialsCounted, 0),
				runs: n,
				censored: rs.some((s) => s.rightCensored),
				costUsd: null,
			};
		})
		.sort((a, b) => b.composite - a.composite);

	const mixedSets =
		new Set(
			active.map((r) =>
				(r.summary?.scores ?? [])
					.map((s) => s.candidate)
					.sort()
					.join(","),
			),
		).size > 1;
	const multiConfig =
		new Set(rows.map((r) => `${r.harness}|${r.model}`)).size > 1;
	const [first, second] = rows;
	const notSeparable =
		!!first &&
		!!second &&
		(first.min <= second.max ||
			(active.length === 1 && !!active[0]?.summary?.inconclusive));
	// A single trial per framework can't separate a ranking, however large the
	// gap looks (PRODUCT principle 3): say so instead of presenting a winner.
	const singleTrial = rows.length > 1 && rows.every((r) => r.trials < 2);
	const nLabel = singleTrial
		? "n=1 per framework"
		: `n=${Math.min(...rows.map((r) => r.trials))}+ per framework`;
	const best = (k: keyof Weights) => Math.max(...rows.map((r) => r.dims[k]));
	const recent = [...runs]
		.sort((a, b) => (runTs(b.runId) ?? 0) - (runTs(a.runId) ?? 0))
		.slice(0, RECENT);
	const models = [
		...new Set(
			active.map(
				(r) => r.summary?.workerModel?.name ?? r.summary?.config.model ?? "",
			),
		),
	].filter(Boolean);

	return (
		<>
			<PageHeader
				title="Leaderboard"
				description="Who builds each spec best, with harness and model held fixed. Every score links back to its evidence."
				actions={
					<>
						<Select value={activeTarget} onValueChange={(v) => setTarget(v)}>
							<SelectTrigger
								aria-label="Target"
								className="h-8 w-auto min-w-[200px] gap-2 text-[13px]"
							>
								<span className="text-muted-foreground">Target</span>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{targets.map(([name, title]) => (
									<SelectItem key={name} value={name}>
										{title}
									</SelectItem>
								))}
								<SelectItem value={ALL}>All targets</SelectItem>
							</SelectContent>
						</Select>
						<a href="/configure" className={btn.primary}>
							<Plus className="size-3.5" />
							New run
						</a>
					</>
				}
			/>

			{rows.length === 0 ? (
				<Card className="grid place-items-center gap-2 px-6 py-16 text-center">
					<h2 className="m-0 text-[15px] font-semibold">No graded runs yet</h2>
					<p className="m-0 max-w-[48ch] text-[13.5px] text-muted-foreground">
						Start a run to build a target with two or more frameworks. Graded
						results show up here as soon as the evaluator and judge finish.
					</p>
					<a href="/configure" className={`${btn.primary} mt-2`}>
						<Plus className="size-3.5" />
						New run
					</a>
				</Card>
			) : (
				<div className="grid grid-cols-1 gap-6">
					<div className="grid min-w-0 grid-cols-1 content-start gap-6">
						{notSeparable && first && second && (
							<Callout title="Top two not separable.">
								{first.candidate} leads {second.candidate} by{" "}
								<span className="font-mono">
									{(first.composite - second.composite).toFixed(1)}
								</span>{" "}
								points, inside their score ranges. Run 3+ trials per framework
								before calling a winner.
							</Callout>
						)}
						{singleTrial && !notSeparable && first && second && (
							<Callout title="One trial per framework.">
								{first.candidate} is ahead, but each score comes from a single
								trial, so the order is not separable yet. Run 3+ trials per
								framework before calling a winner.
							</Callout>
						)}
						{mixedSets && (
							<Callout title="Mixed candidate sets.">
								The included runs tested different frameworks, so speed* and
								spend* are not comparable across them.
							</Callout>
						)}

						<Card className="p-5">
							<SectionTitle
								aside={`${targetTitle} · ${nLabel}${models.length ? ` · ${models.join(", ")}` : ""}`}
							>
								Composite score
							</SectionTitle>
							<CompositeChart
								rows={rows.map((r) => ({
									key: r.key,
									label: multiConfig
										? `${r.candidate} · ${r.model}`
										: r.candidate,
									value: r.composite,
									min: r.min,
									max: r.max,
								}))}
							/>
						</Card>

						<Card className="overflow-hidden">
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="w-10 pl-5">#</TableHead>
										<TableHead>Framework</TableHead>
										{multiConfig && <TableHead>Harness / model</TableHead>}
										<ColHead label="Composite" className="text-right" />
										{Object.values(DIM_LABELS).map((l) => (
											<ColHead key={l} label={l} className="text-right" />
										))}
										<ColHead label="Trials" className="pr-5 text-right" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{rows.map((r, i) => (
										<TableRow key={r.key}>
											<TableCell className="pl-5 font-mono text-[12.5px] text-muted-foreground">
												{i + 1}
											</TableCell>
											<TableCell>
												<span className="flex items-center gap-2 whitespace-nowrap font-medium">
													{r.candidate}
													{notSeparable && i < 2 && (
														<Badge variant="warn">tied</Badge>
													)}
													{r.censored && <Badge variant="warn">capped</Badge>}
												</span>
											</TableCell>
											{multiConfig && (
												<TableCell className="font-mono text-[12px] text-muted-foreground">
													{r.harness} / {r.model}
												</TableCell>
											)}
											<TableCell className="text-right font-mono text-[13.5px] font-semibold">
												{r.composite.toFixed(1)}
											</TableCell>
											{DIM_KEYS.map((k) => (
												<TableCell
													key={k}
													className={`text-right font-mono text-[13px] ${r.dims[k] === best(k) ? "font-semibold text-foreground" : "text-muted-foreground"}`}
												>
													{fmtDim(k, r.dims[k])}
												</TableCell>
											))}
											<TableCell className="pr-5 text-right font-mono text-[13px] text-muted-foreground">
												{r.trials}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							<WeightControls inline weights={weights} onChange={setWeights} />
						</Card>

						<section>
							<SectionTitle
								aside={
									<a
										href="/runs"
										className="inline-flex items-center gap-0.5 text-muted-foreground no-underline hover:text-foreground"
									>
										All {runs.length} run{runs.length === 1 ? "" : "s"}
										<ChevronRight aria-hidden="true" className="size-3.5" />
									</a>
								}
							>
								Recent runs
							</SectionTitle>
							<Card className="overflow-hidden">
								<Table>
									<TableBody>
										{recent.map((r) => (
											<TableRow
												key={r.runId}
												className="cursor-pointer"
												onClick={() => {
													window.location.href = `/runs/${r.runId}`;
												}}
											>
												<TableCell className="pl-5">
													<a
														href={`/runs/${r.runId}`}
														className="font-medium text-foreground no-underline hover:underline"
													>
														{r.summary?.target?.title ?? (
															<span className="font-mono text-[12.5px]">
																{r.runId}
															</span>
														)}
													</a>
												</TableCell>
												<TableCell className="text-[13px] text-muted-foreground">
													{r.summary
														? r.summary.scores
																.map((s) => s.candidate)
																.join(", ")
														: (r.error ?? "—")}
												</TableCell>
												<TableCell className="whitespace-nowrap font-mono text-[12.5px] text-muted-foreground">
													{r.summary?.config.provider ?? "—"}
												</TableCell>
												<TableCell className="whitespace-nowrap text-right font-mono text-[12.5px]">
													{fmtUsd(r.summary?.costUsd)}
												</TableCell>
												<TableCell className="whitespace-nowrap text-right text-[12.5px] text-muted-foreground">
													{fmtRunDate(runTs(r.runId))}
												</TableCell>
												<TableCell className="pr-5 text-right">
													{!r.supported ? (
														<Badge variant="danger">unsupported</Badge>
													) : r.summary?.inconclusive ? (
														<Badge variant="warn">inconclusive</Badge>
													) : (
														<Badge variant="ok">graded</Badge>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</Card>
						</section>
					</div>
				</div>
			)}
		</>
	);
}
