import { useState } from "react";
import type * as React from "react";
import type { TrialResult } from "../../types";
import type { Turn } from "../../report/transcript-render";
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
import { useFetch } from "../lib/api";
import { Evidence } from "./shared";

interface RunTarget {
	name: string;
	title: string;
	steps: Record<string, string>;
}

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
	const target = useFetch<RunTarget>(`/api/runs/${runId}/target`);
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
			{target && (
				<p className="mt-1 text-[13px]">
					🎯 Building <span className="font-semibold">{target.title}</span>{" "}
					<span className="font-mono text-muted-foreground">
						({target.name})
					</span>
				</p>
			)}
			<p className="font-mono text-[12px] text-muted-foreground">
				{t.provenance.candidate}@{t.provenance.candidateVersion} ·{" "}
				{t.provenance.harness} {t.provenance.harnessVersion} ·{" "}
				{t.provenance.model} · {t.provenance.provider} (
				{t.provenance.snapshotId ?? "no image"}) · status {t.provenance.status}
			</p>
			{t.provenance.status !== "completed" && (
				<div className="mt-2 rounded-md border border-danger-bg bg-danger-bg/20 px-3 py-2 text-[13px]">
					<span className="font-semibold text-danger">
						{t.provenance.status}
						{t.provenance.cappedBy ? ` (${t.provenance.cappedBy})` : ""}
					</span>{" "}
					— this trial did not complete cleanly and is excluded from scoring.
					{t.provenance.notes.length > 0 && (
						<ul className="mt-1 font-mono text-[12px] text-muted-foreground">
							{t.provenance.notes.map((n) => (
								<li key={n.slice(0, 24)}>• {n}</li>
							))}
						</ul>
					)}
				</div>
			)}
			{tel && (
				<p className="mt-1 text-[13px]">
					⏱ {(tel.agentDurationMs / 60000).toFixed(1)}m agent (+
					{(tel.setupDurationMs / 60000).toFixed(1)}m setup) · 💵 $
					{tel.totalCostUsd.toFixed(2)} · {tel.totalTurns} turns ·{" "}
					{(
						tel.totalTokens.inputTokens + tel.totalTokens.outputTokens
					).toLocaleString()}{" "}
					tokens (+{tel.totalTokens.cacheReadTokens.toLocaleString()}{" "}
					cache-read)
				</p>
			)}

			{a && (
				<Section
					title={
						<>
							PRD adherence: {a.gradedScore.toFixed(2)}
							{target && (
								<span className="font-normal text-muted-foreground">
									{" "}
									— {target.title}
								</span>
							)}
						</>
					}
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
										{target?.steps[s.stepId] ? (
											<Tooltip>
												<TooltipTrigger asChild>
													<span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
														{s.stepId}
													</span>
												</TooltipTrigger>
												<TooltipContent className="whitespace-pre-line">
													{target.steps[s.stepId]}
												</TooltipContent>
											</Tooltip>
										) : (
											s.stepId
										)}
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

			<Conversation runId={runId} trialId={trialId} />

			{t.provenance.status === "completed" &&
				t.provenance.notes.length > 0 && (
					<>
						<h2 className="mt-7 text-base font-semibold">Notes</h2>
						<ul className="mt-1 font-mono text-[12px] text-muted-foreground">
							{t.provenance.notes.map((n) => (
								<li key={n}>{n}</li>
							))}
						</ul>
					</>
				)}
		</>
	);
}

interface TranscriptPayload {
	trialId: string;
	sessions: { name: string; turns: Turn[] }[];
}

/**
 * Build-conversation replay (trial-transcript-audit). Lazy-loaded — the
 * transcript is heavy, so it fetches only when opened. Renders request and
 * response as distinct lanes, with large tool payloads collapsed by default.
 */
function Conversation({ runId, trialId }: { runId: string; trialId: string }) {
	const [open, setOpen] = useState(false);
	const [data, setData] = useState<TranscriptPayload>();
	const [err, setErr] = useState<string>();
	const [busy, setBusy] = useState(false);

	const toggle = () => {
		const next = !open;
		setOpen(next);
		if (next && !data && !busy) {
			setBusy(true);
			fetch(`/api/runs/${runId}/trials/${trialId}/transcript`)
				.then((r) =>
					r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
				)
				.then((d: TranscriptPayload) => setData(d))
				.catch((e) => setErr(String(e)))
				.finally(() => setBusy(false));
		}
	};

	return (
		<>
			<h2 className="mt-7 flex items-center gap-2 text-base font-semibold">
				<button
					type="button"
					onClick={toggle}
					className="flex items-center gap-2 hover:text-primary-hover"
				>
					<span className="text-muted-foreground">{open ? "▼" : "▶"}</span>
					Conversation
					<span className="font-normal text-muted-foreground">
						(build replay — request / response)
					</span>
				</button>
			</h2>
			{open && (
				<Card className="mt-2">
					<CardContent className="px-3 pb-3 pt-3">
						{busy && (
							<p className="text-[13px] text-muted-foreground">
								loading transcript…
							</p>
						)}
						{err && (
							<p className="text-[13px] text-danger">
								no readable transcript for this trial ({err})
							</p>
						)}
						{data?.sessions.map((s, si) => (
							<div key={s.name} className={si > 0 ? "mt-5" : ""}>
								<p className="mb-2 font-mono text-[12px] font-semibold text-muted-foreground">
									Session {si} · {s.name}
								</p>
								<div className="flex flex-col gap-2">
									{s.turns.map((turn, ti) => (
										<TurnBlock key={`${s.name}-${ti}`} turn={turn} />
									))}
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}
		</>
	);
}

/** One conversation turn. Request lane (agent → env) and response lane
 *  (env → agent) are visually distinct; oversized payloads are <details>. */
function TurnBlock({ turn }: { turn: Turn }) {
	switch (turn.kind) {
		case "init":
			return (
				<p className="text-[12px] text-muted-foreground">
					⚙ model <span className="font-mono">{turn.model}</span> ·{" "}
					{turn.tools.length} tools{turn.cwd ? ` · ${turn.cwd}` : ""}
				</p>
			);
		case "prompt":
			return (
				<Lane side="request" label="▶ PROMPT · user → agent" tone="prompt">
					<pre className="whitespace-pre-wrap text-[12px]">{turn.text}</pre>
				</Lane>
			);
		case "thinking":
			return (
				<details className="text-[12px] text-muted-foreground">
					<summary className="cursor-pointer">💭 thinking</summary>
					<pre className="mt-1 whitespace-pre-wrap">{turn.text}</pre>
				</details>
			);
		case "assistant":
			return (
				<Lane side="response" label="🟢 assistant" tone="assistant">
					<p className="whitespace-pre-wrap text-[13px]">{turn.text}</p>
				</Lane>
			);
		case "tool_use":
			return (
				<Lane side="request" label={`→ REQUEST · ${turn.tool}`} tone="request">
					<Payload text={JSON.stringify(turn.input, null, 2)} />
				</Lane>
			);
		case "tool_result":
			return (
				<Lane
					side="response"
					label={`← RESPONSE · ${turn.tool ?? "tool"}${turn.isError ? " · ✗ error" : ""}`}
					tone={turn.isError ? "error" : "response"}
				>
					<Payload text={turn.output} />
				</Lane>
			);
		case "result":
			return (
				<p className="mt-1 border-t border-border pt-2 text-[12px] text-muted-foreground">
					■ result: <span className="font-semibold">{turn.status}</span> ·{" "}
					{turn.numTurns} turns · {(turn.durationMs / 1000).toFixed(1)}s · $
					{turn.costUsd.toFixed(4)}
					{turn.usage
						? ` · ${turn.usage.inputTokens} in / ${turn.usage.outputTokens} out tok`
						: ""}
				</p>
			);
	}
}

const TONES: Record<string, string> = {
	prompt: "border-l-primary",
	assistant: "border-l-ok",
	request: "border-l-primary/60",
	response: "border-l-muted-foreground/40",
	error: "border-l-danger",
};

function Lane({
	side,
	label,
	tone,
	children,
}: {
	side: "request" | "response";
	label: string;
	tone: string;
	children: React.ReactNode;
}) {
	return (
		<div className={side === "response" ? "ml-6" : ""}>
			<div className={`border-l-2 ${TONES[tone]} pl-2`}>
				<p className="font-mono text-[11px] font-semibold text-muted-foreground">
					{label}
				</p>
				<div className="mt-0.5">{children}</div>
			</div>
		</div>
	);
}

/** Inline small payloads; collapse large ones behind a <details>. */
function Payload({ text }: { text: string }) {
	const big = text.length > 800;
	if (!big)
		return (
			<pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">
				{text}
			</pre>
		);
	return (
		<details>
			<summary className="cursor-pointer text-[12px] text-muted-foreground">
				show payload ({(text.length / 1024).toFixed(1)} KB)
			</summary>
			<pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">
				{text}
			</pre>
		</details>
	);
}
