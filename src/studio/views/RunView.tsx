import { useState } from "react";
import type { CandidateScore, TrialResult, Weights } from "../../types";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../components/ui/tooltip";
import { DEFAULT_WEIGHTS, DIM_LABELS, reweight, useFetch } from "../lib/api";
import { Bar, ColHead, DIM_KEYS, WeightControls } from "./shared";

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

function StepComparison({
	trials,
	steps,
}: {
	trials: TrialResult[];
	steps: Record<string, string>;
}) {
	const stepInfo = steps;
	const graded = trials.filter((t) => t.grades?.adherence);
	if (graded.length < 2) return null;
	const stepIds = [
		...new Set(
			graded.flatMap((t) =>
				(t.grades?.adherence?.stepResults ?? []).map((s) => s.stepId),
			),
		),
	];
	const cell = (t: TrialResult, id: string) => {
		const s = t.grades?.adherence?.stepResults.find((x) => x.stepId === id);
		if (!s) return <span className="text-muted-foreground">·</span>;
		const icon =
			s.outcome === "pass" ? "✅" : s.outcome === "partial" ? `🟡${s.credit}` : "❌";
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="cursor-help">{icon}</span>
				</TooltipTrigger>
				<TooltipContent>{s.evidence}</TooltipContent>
			</Tooltip>
		);
	};
	return (
		<>
			<h2 className="mt-7 text-base font-semibold">
				Step comparison{" "}
				<span className="font-normal text-muted-foreground">
					(adherence test plan across trials)
				</span>
			</h2>
			<Card className="mt-2">
				<CardContent className="px-2 pb-2 pt-2">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Step</TableHead>
								{graded.map((t) => (
									<TableHead
										key={t.provenance.trialId}
										className="font-mono normal-case"
									>
										{t.provenance.trialId}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{stepIds.map((id) => (
								<TableRow key={id}>
									<TableCell className="font-mono text-[12px]">
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="cursor-help">{id}</span>
											</TooltipTrigger>
											<TooltipContent>{stepInfo?.[id] ?? "…"}</TooltipContent>
										</Tooltip>
									</TableCell>
									{graded.map((t) => (
										<TableCell key={t.provenance.trialId}>
											{cell(t, id)}
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</>
	);
}

export function RunView({ runId }: { runId: string }) {
	const entry = useFetch<{ supported: boolean; error?: string; results?: RunResults }>(
		`/api/runs/${runId}`,
	);
	const target = useFetch<RunTarget>(`/api/runs/${runId}/target`);
	const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
	if (!entry) return <p className="text-muted-foreground">loading…</p>;
	if (!entry.supported || !entry.results)
		return (
			<p>
				<Badge variant="danger">unsupported</Badge> {entry.error}
			</p>
		);
	const r = entry.results;
	const rows = reweight(r.scores, weights);
	const combined = runId.startsWith("combined:");
	const fmt = (iso: string | null) =>
		iso ? new Date(iso).toLocaleString() : "—";

	return (
		<>
			<p>
				<a href="/" className="text-primary-hover hover:underline">
					← leaderboard
				</a>
			</p>
			<h1 className="font-mono text-lg font-bold">
				{combined ? "Combined run" : runId}
			</h1>
			{target && (
				<p className="mt-1 text-[13px]">
					🎯 Building <span className="font-semibold">{target.title}</span>{" "}
					<span className="font-mono text-muted-foreground">
						({target.name})
					</span>
				</p>
			)}
			<p className="text-[13px] text-muted-foreground">
				🗓 {fmt(r.startedAt)} → {fmt(r.endedAt)} · {String(r.config.harness)} /{" "}
				{String(r.config.model)} on {String(r.config.provider)} · judge{" "}
				{String(r.config.judgeModel)} · {r.trials.length} trial(s)
			</p>
			{r.inconclusive && (
				<p className="mt-2">
					<Badge variant="warn">
						top-two composite ranges overlap — ordering inconclusive
					</Badge>
				</p>
			)}
			<WeightControls weights={weights} onChange={setWeights} />

			<Card>
				<CardContent className="px-2 pb-2 pt-2">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8">#</TableHead>
								<TableHead>Candidate</TableHead>
								<ColHead label="Composite" />
								{Object.values(DIM_LABELS).map((l) => (
									<ColHead key={l} label={l} />
								))}
								<TableHead>±σ</TableHead>
								<TableHead>Trials</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((s, i) => (
								<TableRow key={s.candidate}>
									<TableCell className="text-muted-foreground">{i + 1}</TableCell>
									<TableCell className="font-semibold">{s.candidate}</TableCell>
									<TableCell>
										<Bar v={s.rw} />
									</TableCell>
									{DIM_KEYS.map((k) => (
										<TableCell key={k}>
											<Bar v={s.dimensions[k]} />
										</TableCell>
									))}
									<TableCell className="font-mono text-[12px]">
										{s.compositeStats.stddev.toFixed(1)}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{s.trialsCounted}
										{s.rightCensored && (
											<Badge variant="warn" className="ml-1">
												capped
											</Badge>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<h2 className="mt-7 text-base font-semibold">Trials</h2>
			<Card className="mt-2">
				<CardContent className="px-2 pb-2 pt-2">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Trial</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Graded</TableHead>
								<TableHead>Quality</TableHead>
								<TableHead>Agent time</TableHead>
								<TableHead>Cost</TableHead>
								<TableHead>Turns</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{r.trials.map((t) => (
								<TableRow key={t.provenance.trialId}>
									<TableCell>
										<a
											href={`/runs/${runId}/trials/${t.provenance.trialId}`}
											className="font-mono text-[12px] text-primary-hover hover:underline"
										>
											{t.provenance.trialId}
										</a>
									</TableCell>
									<TableCell className="text-[13px]">
										{t.provenance.status}
										{t.provenance.cappedBy ? ` (${t.provenance.cappedBy})` : ""}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{t.grades?.adherence
											? t.grades.adherence.gradedScore.toFixed(1)
											: "—"}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{t.grades?.quality ? t.grades.quality.score.toFixed(0) : "—"}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{t.telemetry
											? `${(t.telemetry.agentDurationMs / 60000).toFixed(1)}m`
											: "—"}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{t.telemetry
											? `$${t.telemetry.totalCostUsd.toFixed(2)}`
											: "—"}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{t.telemetry?.totalTurns ?? "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<StepComparison trials={r.trials} steps={target?.steps ?? {}} />

			{r.exclusions.length > 0 && (
				<>
					<h2 className="mt-7 text-base font-semibold">Excluded trials</h2>
					<ul className="mt-1 text-[13px] text-muted-foreground">
						{r.exclusions.map((e) => (
							<li key={e.trialId}>
								<span className="font-mono">{e.trialId}</span> — {e.status}:{" "}
								{e.reason}
							</li>
						))}
					</ul>
				</>
			)}

			<h2 className="mt-7 text-base font-semibold">Provenance</h2>
			<p className="mt-1 font-mono text-[12px] text-muted-foreground">
				PRD {r.prdSha256.slice(0, 16)}… · test plan{" "}
				{r.testPlanSha256?.slice(0, 16) ?? "n/a"}… · judge{" "}
				{String(r.config.judgeModel)} · {String(r.config.harness)}/
				{String(r.config.model)} on {String(r.config.provider)}
			</p>
		</>
	);
}
