import type * as React from "react";
import type { TrialResult } from "../../types";
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
import { Evidence } from "./shared";

function Section({
	title,
	right,
	children,
}: {
	title: React.ReactNode;
	right?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<>
			<h2 className="mt-7 flex items-center gap-2 text-base font-semibold">
				{title}
				{right}
			</h2>
			<Card className="mt-2">
				<CardContent className="px-2 pb-2 pt-2">{children}</CardContent>
			</Card>
		</>
	);
}

export function TrialView({
	runId,
	trialId,
}: {
	runId: string;
	trialId: string;
}) {
	const t = useFetch<TrialResult>(`/api/runs/${runId}/trials/${trialId}`);
	if (!t) return <p className="text-muted-foreground">loading…</p>;
	if (!t.provenance) return <Badge variant="danger">not found</Badge>;
	const a = t.grades?.adherence;
	const q = t.grades?.quality;
	const integ = t.grades?.integration;
	const tel = t.telemetry;

	return (
		<>
			<p>
				<a
					href={`/runs/${runId}`}
					className="text-primary-hover hover:underline"
				>
					← {runId}
				</a>
			</p>
			<h1 className="font-mono text-lg font-bold">{trialId}</h1>
			<p className="font-mono text-[12px] text-muted-foreground">
				{t.provenance.candidate}@{t.provenance.candidateVersion} ·{" "}
				{t.provenance.harness} {t.provenance.harnessVersion} ·{" "}
				{t.provenance.model} · {t.provenance.provider} (
				{t.provenance.snapshotId ?? "no image"}) · status {t.provenance.status}
			</p>
			{tel && (
				<p className="mt-1 text-[13px]">
					⏱ {(tel.agentDurationMs / 60000).toFixed(1)}m agent (+
					{(tel.setupDurationMs / 60000).toFixed(1)}m setup) · 💵 $
					{tel.totalCostUsd.toFixed(2)} · {tel.totalTurns} turns ·{" "}
					{(
						tel.totalTokens.inputTokens + tel.totalTokens.outputTokens
					).toLocaleString()}{" "}
					tokens (+{tel.totalTokens.cacheReadTokens.toLocaleString()} cache-read)
				</p>
			)}

			{a && (
				<Section
					title={`PRD adherence: ${a.gradedScore.toFixed(2)}`}
					right={
						<>
							{a.passAt1 && <Badge variant="ok">pass@1</Badge>}
							{a.completeFailure && (
								<Badge variant="danger">complete failure</Badge>
							)}
						</>
					}
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Step</TableHead>
								<TableHead>Outcome</TableHead>
								<TableHead>Credit</TableHead>
								<TableHead>Evidence</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{a.stepResults.map((s) => (
								<TableRow key={s.stepId}>
									<TableCell className="font-mono text-[12px]">
										{s.stepId}
									</TableCell>
									<TableCell className="text-[13px]">
										{s.outcome === "pass"
											? "✅"
											: s.outcome === "partial"
												? "🟡"
												: "❌"}{" "}
										{s.outcome}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{s.credit}
									</TableCell>
									<TableCell className="max-w-[520px] text-[12px]">
										<Evidence text={s.evidence} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>
			)}

			{q && (
				<Section
					title={`Code quality: ${q.score.toFixed(0)}`}
					right={
						<span className="font-normal text-muted-foreground">
							({q.judgeModel})
						</span>
					}
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Criterion</TableHead>
								<TableHead>Samples</TableHead>
								<TableHead>Median</TableHead>
								<TableHead>Justification</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{q.criteria.map((c) => (
								<TableRow key={c.criterion}>
									<TableCell className="text-[13px]">{c.criterion}</TableCell>
									<TableCell className="font-mono text-[12px]">
										{c.samples.join(", ")}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{c.score}
									</TableCell>
									<TableCell className="max-w-[520px] text-[12px]">
										<Evidence text={c.justification} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>
			)}

			{integ?.ran && (
				<Section
					title="Real-integration bonus tier"
					right={<Badge variant="ok">ran</Badge>}
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Fixture</TableHead>
								<TableHead>Dispatched</TableHead>
								<TableHead>Workspace</TableHead>
								<TableHead>Agent run</TableHead>
								<TableHead>Handoff</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{integ.fixtures.map((f) => (
								<TableRow key={f.fixtureId}>
									<TableCell className="font-mono text-[12px]">
										{f.fixtureId}
									</TableCell>
									<TableCell>{f.dispatched ? "✅" : "❌"}</TableCell>
									<TableCell>{f.workspaceCreated ? "✅" : "❌"}</TableCell>
									<TableCell>{f.agentRunCompleted ? "✅" : "❌"}</TableCell>
									<TableCell>{f.handoffReached ? "✅" : "❌"}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Section>
			)}

			{t.provenance.notes.length > 0 && (
				<>
					<h2 className="mt-7 text-base font-semibold">Notes</h2>
					<ul className="mt-1 font-mono text-[12px] text-muted-foreground">
						{t.provenance.notes.map((n, i) => (
							<li key={`${i}-${n.slice(0, 12)}`}>{n}</li>
						))}
					</ul>
				</>
			)}
		</>
	);
}
