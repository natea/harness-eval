import { useState } from "react";
import type { CandidateScore, Weights } from "../../types";
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
	DEFAULT_WEIGHTS,
	DIM_LABELS,
	type RunSummary,
	reweight,
	useFetch,
} from "../lib/api";
import { Bar, ColHead, DIM_KEYS, WeightControls } from "./shared";

export function Leaderboard() {
	const runs = useFetch<RunSummary[]>("/api/runs");
	const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	if (!runs) return <p className="text-muted-foreground">loading…</p>;

	const supported = runs.filter((r) => r.supported && r.summary);
	const active = supported.filter(
		(r) => selected.size === 0 || selected.has(r.runId),
	);

	// Aggregate mean of per-run re-weighted composites per candidate/harness/model.
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
	const candidateSets = active.map((r) =>
		(r.summary?.scores ?? [])
			.map((s) => s.candidate)
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
				} as Record<keyof Weights, number>,
				trials: rs.reduce((a, s) => a + s.trialsCounted, 0),
				runs: n,
				censored: rs.some((s) => s.rightCensored),
			};
		})
		.sort((a, b) => b.composite - a.composite);

	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">
				🏆 Coding-harness leaderboard
			</h1>
			<WeightControls weights={weights} onChange={setWeights} />
			{mixedSets && (
				<p className="mb-2">
					<Badge variant="warn">
						mixed candidate sets across selected runs — speed*/spend* are
						within-run normalized and not comparable across them
					</Badge>
				</p>
			)}

			<Card>
				<CardContent className="px-2 pb-2 pt-2">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8">#</TableHead>
								<TableHead>Candidate</TableHead>
								<TableHead>Harness / model</TableHead>
								<ColHead label="Composite" />
								{Object.values(DIM_LABELS).map((l) => (
									<ColHead key={l} label={l} />
								))}
								<ColHead label="Trials" />
								<TableHead>Flags</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r, i) => (
								<TableRow key={r.candidate}>
									<TableCell className="text-muted-foreground">
										{i + 1}
									</TableCell>
									<TableCell className="font-semibold">{r.candidate}</TableCell>
									<TableCell className="font-mono text-[12px] text-muted-foreground">
										{r.harness} / {r.model}
									</TableCell>
									<TableCell>
										<Bar v={r.composite} />
									</TableCell>
									{DIM_KEYS.map((k) => (
										<TableCell key={k}>
											<Bar v={r.dims[k]} />
										</TableCell>
									))}
									<TableCell className="font-mono text-[12px]">
										{r.trials}
									</TableCell>
									<TableCell>
										{r.censored && <Badge variant="warn">right-censored</Badge>}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<p className="mt-2 text-[12px] text-muted-foreground">
				* speed and token spend are min-max normalized within each run's
				candidate set.
			</p>

			<h2 className="mt-7 text-base font-semibold">Runs</h2>
			<Card className="mt-2">
				<CardContent className="px-2 pb-2 pt-2">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8" />
								<TableHead>Run</TableHead>
								<TableHead>App / PRD</TableHead>
								<TableHead>Provider</TableHead>
								<TableHead>Worker model</TableHead>
								<TableHead>Candidates</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{runs.map((r) => (
								<TableRow key={r.runId}>
									<TableCell>
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
									</TableCell>
									<TableCell>
										<a
											href={`/runs/${r.runId}`}
											className="font-mono text-[12px] text-primary-hover hover:underline"
										>
											{r.runId}
										</a>
									</TableCell>
									<TableCell className="text-[13px]">
										{r.summary?.target ? (
											<>
												{r.summary.target.title}{" "}
												<span className="font-mono text-[11px] text-muted-foreground">
													({r.summary.target.name})
												</span>
											</>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{r.summary?.config.provider ?? "—"}
									</TableCell>
									<TableCell className="font-mono text-[12px] text-muted-foreground">
										{r.summary?.workerModel?.name ??
											r.summary?.config.model ??
											"—"}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{r.summary
											? r.summary.scores.map((s) => s.candidate).join(", ")
											: "—"}
									</TableCell>
									<TableCell>
										{r.supported ? (
											r.summary?.inconclusive ? (
												<Badge variant="warn">inconclusive</Badge>
											) : (
												<Badge variant="ok">ok</Badge>
											)
										) : (
											<Badge variant="danger">unsupported</Badge>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</>
	);
}
