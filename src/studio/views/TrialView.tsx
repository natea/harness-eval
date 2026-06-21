import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Smooth-scroll to an anchored element (sections + conversation turns). */
function jumpTo(id: string) {
	document.getElementById(id)?.scrollIntoView({
		behavior: "smooth",
		block: "start",
	});
}

/** Sticky page-level jump bar so a long trial page (big adherence table + a
 *  long build conversation) is navigable without endless scrolling. */
function PageNav({ items }: { items: { id: string; label: string }[] }) {
	if (items.length < 2) return null;
	return (
		<nav className="sticky top-0 z-20 -mx-6 mb-1 flex flex-wrap items-center gap-1 border-b border-border bg-background/95 px-6 py-2 backdrop-blur">
			<span className="mr-1 text-[11px] uppercase tracking-wide text-muted-foreground">
				jump to
			</span>
			{items.map((it) => (
				<button
					key={it.id}
					type="button"
					onClick={() => jumpTo(it.id)}
					className="rounded border border-border px-2 py-0.5 text-[12px] text-foreground hover:bg-muted hover:text-primary-hover"
				>
					{it.label}
				</button>
			))}
		</nav>
	);
}

function Section({
	id,
	title,
	right,
	children,
}: {
	id?: string;
	title: React.ReactNode;
	right?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<>
			<h2
				id={id}
				className="mt-7 flex scroll-mt-16 items-center gap-2 text-base font-semibold"
			>
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
	// Live jobs (this session's running runs) — used to show the live build stream
	// for a trial whose run hasn't finished/indexed yet (live-build-stream).
	const queue = useFetch<{ runId: string; status: string; stage?: string }[]>(
		"/api/queue",
	);
	// Build-conversation state lifted here so a step row can command it: open it
	// and jump to the turn that best explains the step's outcome.
	const convo = useTranscript(runId, trialId);

	// Jump from an adherence step (or quality criterion) to the build conversation
	// turn that best matches the evidence — the evaluator's evidence usually names
	// the concrete tokens it probed for (endpoints, flags, symbols, files), and
	// those tokens land you where the agent did (or skipped) that work.
	const jumpFromEvidence = useCallback(
		(...texts: (string | undefined)[]) => {
			const terms = extractTerms(texts.filter(Boolean).join(" "));
			convo.open();
			convo.load().then((data) => {
				if (!data) return;
				const id = bestTurnMatch(data.sessions, terms);
				// Let the panel paint before scrolling to the (possibly new) anchor.
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						if (id) {
							convo.highlight(id);
							jumpTo(id);
						} else {
							jumpTo("sec-conversation");
						}
					}),
				);
			});
		},
		[convo],
	);

	if (!t) return <p className="text-muted-foreground">loading…</p>;
	if (!t.provenance) {
		// The run isn't finalized/indexed yet. If it's a running live job, show the
		// live build stream; otherwise it's genuinely not found.
		const job = queue?.find((q) => q.runId === runId);
		if (job?.status === "running") {
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
					<p className="mt-1 text-[13px] text-muted-foreground">
						building{job.stage ? ` · ${job.stage}` : ""} — streaming live
					</p>
					<LiveStream runId={runId} trialId={trialId} />
				</>
			);
		}
		return <Badge variant="danger">not found</Badge>;
	}
	const a = t.grades?.adherence;
	const q = t.grades?.quality;
	const integ = t.grades?.integration;
	const tel = t.telemetry;

	const navItems = [
		a && { id: "sec-adherence", label: "PRD adherence" },
		q && { id: "sec-quality", label: "Code quality" },
		integ?.ran && { id: "sec-integration", label: "Integration" },
		{ id: "sec-conversation", label: "Conversation" },
	].filter(Boolean) as { id: string; label: string }[];

	return (
		<>
			<PageNav items={navItems} />
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
							{t.provenance.notes.map((n, i) => (
								<li key={`${i}-${n.slice(0, 24)}`}>• {n}</li>
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
					id="sec-adherence"
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
							{a.stepResults.map((s, i) => (
								<TableRow key={`${i}-${s.stepId}`}>
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
										<span className="flex items-center gap-1.5">
											<span>
												{s.outcome === "pass"
													? "✅"
													: s.outcome === "partial"
														? "🟡"
														: "❌"}{" "}
												{s.outcome}
											</span>
											{s.outcome !== "pass" && (
												<button
													type="button"
													title="Jump to where this was handled in the build conversation"
													onClick={() =>
														jumpFromEvidence(
															s.evidence,
															target?.steps[s.stepId],
														)
													}
													className="rounded border border-border px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-primary-hover"
												>
													↳ trace
												</button>
											)}
										</span>
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
					id="sec-quality"
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
							{q.criteria.map((c, i) => (
								<TableRow key={`${i}-${c.criterion}`}>
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
					id="sec-integration"
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
							{integ.fixtures.map((f, i) => (
								<TableRow key={`${i}-${f.fixtureId}`}>
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

			<Artifacts runId={runId} trialId={trialId} />

			{t.provenance.status !== "completed" && (
				<LiveStream runId={runId} trialId={trialId} />
			)}

			<Conversation convo={convo} />

			{t.provenance.status === "completed" &&
				t.provenance.notes.length > 0 && (
					<>
						<h2 className="mt-7 text-base font-semibold">Notes</h2>
						<ul className="mt-1 font-mono text-[12px] text-muted-foreground">
							{t.provenance.notes.map((n, i) => (
								<li key={`${i}-${n.slice(0, 32)}`}>{n}</li>
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

export interface TranscriptCtl {
	isOpen: boolean;
	data?: TranscriptPayload;
	busy: boolean;
	err?: string;
	highlightId?: string;
	open(): void;
	toggle(): void;
	load(): Promise<TranscriptPayload | undefined>;
	highlight(id: string): void;
}

/**
 * Build-conversation controller (trial-transcript-audit). Lazy-loads the
 * transcript (heavy) once, dedupes concurrent loads, and exposes open/jump
 * controls so a step row elsewhere on the page can drive it. Lifted out of the
 * view so "↳ trace" from an adherence step can open + scroll the replay.
 */
function useTranscript(runId: string, trialId: string): TranscriptCtl {
	const [isOpen, setOpen] = useState(false);
	const [data, setData] = useState<TranscriptPayload>();
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string>();
	const [highlightId, setHighlightId] = useState<string>();
	const inflight = useRef<Promise<TranscriptPayload | undefined>>(undefined);

	const load = useCallback(() => {
		if (data) return Promise.resolve<TranscriptPayload | undefined>(data);
		if (inflight.current) return inflight.current;
		setBusy(true);
		const p = fetch(`/api/runs/${runId}/trials/${trialId}/transcript`)
			.then((r) =>
				r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
			)
			.then((d: TranscriptPayload) => {
				setData(d);
				return d;
			})
			.catch((e) => {
				setErr(String(e));
				return undefined;
			})
			.finally(() => setBusy(false));
		inflight.current = p;
		return p;
	}, [data, runId, trialId]);

	const open = useCallback(() => {
		setOpen(true);
		void load();
	}, [load]);
	const toggle = useCallback(() => {
		setOpen((o) => {
			if (!o) void load();
			return !o;
		});
	}, [load]);
	const highlight = useCallback((id: string) => {
		setHighlightId(id);
		setTimeout(
			() => setHighlightId((cur) => (cur === id ? undefined : cur)),
			2600,
		);
	}, []);

	return { isOpen, data, busy, err, highlightId, open, toggle, load, highlight };
}

/** Concatenated searchable text for a turn (used for step→conversation jumps). */
function turnText(t: Turn): string {
	switch (t.kind) {
		case "tool_use":
			return `${t.tool} ${JSON.stringify(t.input)}`;
		case "tool_result":
			return `${t.tool ?? ""} ${t.output}`;
		case "assistant":
		case "prompt":
		case "thinking":
			return t.text;
		default:
			return "";
	}
}

// Words too common to be useful jump anchors.
const STOP = new Set([
	"the", "and", "for", "with", "that", "this", "from", "have", "test", "pass",
	"fail", "check", "step", "output", "value", "values", "true", "false", "null",
	"http", "json", "run", "log", "code",
]);

/**
 * Pull distinctive tokens out of evaluator evidence / a step's check: quoted
 * strings, flags, paths, dotted/camel/snake identifiers. These are exactly the
 * things the evaluator probed for, so matching them in the build conversation
 * lands you where the agent did (or skipped) that work.
 */
export function extractTerms(text: string): string[] {
	const terms = new Set<string>();
	for (const m of text.matchAll(/[`'"]([^`'"]{2,48})[`'"]/g))
		if (m[1]) terms.add(m[1].trim());
	for (const m of text.matchAll(
		/--[\w-]{2,}|\/?[\w.+-]+(?:\/[\w.+-]+)+|[A-Za-z_]\w*\.[A-Za-z_][\w.]*|[a-z][a-z0-9]*[A-Z][A-Za-z0-9]+|[A-Za-z]{2,}_[A-Za-z0-9_]{2,}/g,
	))
		terms.add(m[0]);
	return [...terms]
		.map((s) => s.trim())
		.filter((s) => s.length >= 3 && !STOP.has(s.toLowerCase()));
}

/** Id of the conversation turn that best matches `terms`, or null if none hit. */
export function bestTurnMatch(
	sessions: TranscriptPayload["sessions"],
	terms: string[],
): string | null {
	if (!terms.length) return null;
	const lc = terms.map((t) => t.toLowerCase());
	let bestId: string | null = null;
	let bestScore = 0;
	sessions.forEach((s, si) => {
		s.turns.forEach((turn, ti) => {
			const hay = turnText(turn).toLowerCase();
			if (!hay) return;
			let score = 0;
			for (const term of lc) if (hay.includes(term)) score++;
			if (score > bestScore) {
				bestScore = score;
				bestId = `c-${si}-${ti}`;
			}
		});
	});
	return bestScore > 0 ? bestId : null;
}

interface OutlineItem {
	id: string;
	session: number;
	kind: "session" | "prompt" | "chapter" | "error";
	label: string;
}

function firstLine(text: string, n = 72): string {
	const line = text.trim().split("\n")[0] ?? "";
	return line.length > n ? `${line.slice(0, n)}…` : line;
}

/** Navigable outline: session headers + the agent's narration lines as
 *  "chapters" + every errored tool result, so a long log is scannable. */
function buildOutline(sessions: TranscriptPayload["sessions"]): OutlineItem[] {
	const items: OutlineItem[] = [];
	sessions.forEach((s, si) => {
		items.push({
			id: `sess-${si}`,
			session: si,
			kind: "session",
			label: `Session ${si}`,
		});
		s.turns.forEach((turn, ti) => {
			const id = `c-${si}-${ti}`;
			if (turn.kind === "prompt")
				items.push({ id, session: si, kind: "prompt", label: firstLine(turn.text) });
			else if (turn.kind === "assistant")
				items.push({ id, session: si, kind: "chapter", label: firstLine(turn.text) });
			else if (turn.kind === "tool_result" && turn.isError)
				items.push({
					id,
					session: si,
					kind: "error",
					label: `✗ ${turn.tool ?? "tool"}`,
				});
		});
	});
	return items;
}

/**
 * Build-conversation replay (trial-transcript-audit), driven by a TranscriptCtl
 * so steps can open/jump it. Renders request/response lanes and a sticky
 * navigation toolbar (session pills, error cycler, collapsible outline) so a
 * long transcript is navigable without endless scrolling.
 */
function Conversation({ convo }: { convo: TranscriptCtl }) {
	const { isOpen, data, busy, err, highlightId } = convo;
	const outline = useMemo(
		() => (data ? buildOutline(data.sessions) : []),
		[data],
	);
	const errors = useMemo(() => outline.filter((o) => o.kind === "error"), [outline]);
	const [showOutline, setShowOutline] = useState(false);
	const [errCursor, setErrCursor] = useState(0);

	const cycleError = (dir: number) => {
		if (!errors.length) return;
		const next = (errCursor + dir + errors.length) % errors.length;
		setErrCursor(next);
		const target = errors[next];
		if (target) {
			convo.highlight(target.id);
			jumpTo(target.id);
		}
	};

	return (
		<>
			<h2
				id="sec-conversation"
				className="mt-7 flex scroll-mt-16 items-center gap-2 text-base font-semibold"
			>
				<button
					type="button"
					onClick={convo.toggle}
					className="flex items-center gap-2 hover:text-primary-hover"
				>
					<span className="text-muted-foreground">{isOpen ? "▼" : "▶"}</span>
					Conversation
					<span className="font-normal text-muted-foreground">
						(build replay — request / response)
					</span>
				</button>
			</h2>
			{isOpen && (
				<Card className="mt-2">
					<CardContent className="px-3 pb-3 pt-0">
						{busy && (
							<p className="py-3 text-[13px] text-muted-foreground">
								loading transcript…
							</p>
						)}
						{err && (
							<p className="py-3 text-[13px] text-danger">
								no readable transcript for this trial ({err})
							</p>
						)}
						{data && (
							<>
								<div className="sticky top-9 z-10 -mx-3 mb-2 flex flex-wrap items-center gap-1.5 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
									<button
										type="button"
										onClick={() => jumpTo("sec-conversation")}
										className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-primary-hover"
									>
										⊤ top
									</button>
									{data.sessions.map((s, si) => (
										<button
											type="button"
											key={`pill-${si}`}
											onClick={() => jumpTo(`sess-${si}`)}
											className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-primary-hover"
										>
											S{si}
										</button>
									))}
									{errors.length > 0 && (
										<span className="ml-1 inline-flex items-center gap-1 rounded border border-danger-bg px-1 py-0.5 text-[11px]">
											<button
												type="button"
												onClick={() => cycleError(-1)}
												className="hover:text-primary-hover"
											>
												◀
											</button>
											<span className="text-danger">
												⚠ {errors.length} error{errors.length > 1 ? "s" : ""}
											</span>
											<button
												type="button"
												onClick={() => cycleError(1)}
												className="hover:text-primary-hover"
											>
												▶
											</button>
										</span>
									)}
									<button
										type="button"
										onClick={() => setShowOutline((v) => !v)}
										className="ml-auto rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-primary-hover"
									>
										☰ outline
									</button>
								</div>
								{showOutline && (
									<div className="mb-3 max-h-64 overflow-y-auto rounded border border-border bg-muted/30 p-2 text-[12px]">
										{outline.map((o) => (
											<button
												type="button"
												key={o.id}
												onClick={() => {
													convo.highlight(o.id);
													jumpTo(o.id);
												}}
												className={`block w-full truncate text-left hover:text-primary-hover ${
													o.kind === "session"
														? "mt-1.5 font-mono font-semibold text-foreground"
														: "pl-3"
												} ${o.kind === "error" ? "text-danger" : o.kind === "session" ? "" : "text-muted-foreground"}`}
											>
												{o.kind === "chapter"
													? "• "
													: o.kind === "prompt"
														? "▶ "
														: ""}
												{o.label}
											</button>
										))}
									</div>
								)}
								{data.sessions.map((s, si) => (
									<div key={`sess-block-${si}`} className={si > 0 ? "mt-5" : ""}>
										<p
											id={`sess-${si}`}
											className="mb-2 scroll-mt-24 font-mono text-[12px] font-semibold text-muted-foreground"
										>
											Session {si} · {s.name}
										</p>
										<div className="flex flex-col gap-2">
											{s.turns.map((turn, ti) => {
												const id = `c-${si}-${ti}`;
												return (
													<div
														key={id}
														id={id}
														className={`scroll-mt-24 rounded transition-shadow ${
															highlightId === id
																? "ring-2 ring-primary ring-offset-2 ring-offset-card"
																: ""
														}`}
													>
														<TurnBlock turn={turn} />
													</div>
												);
											})}
										</div>
									</div>
								))}
							</>
						)}
					</CardContent>
				</Card>
			)}
		</>
	);
}

/** One conversation turn. Request lane (agent → env) and response lane
 *  (env → agent) are visually distinct; oversized payloads are <details>. */
/**
 * Live build stream (live-build-stream): subscribes to the trial's SSE stream and
 * renders redacted turns as the agent works, then hands off to the archived
 * Conversation replay below on `done`. Read-only; auto-cleans the EventSource.
 */
function LiveStream({ runId, trialId }: { runId: string; trialId: string }) {
	const [turns, setTurns] = useState<Turn[]>([]);
	const [state, setState] = useState<
		"connecting" | "streaming" | "done" | "error"
	>("connecting");
	const doneRef = useRef(false);

	useEffect(() => {
		const es = new EventSource(`/api/runs/${runId}/trials/${trialId}/stream`);
		es.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data) as { type: string; turns?: Turn[] };
				if (msg.type === "turns" && msg.turns) {
					setState("streaming");
					setTurns((prev) => [...prev, ...msg.turns!]);
				} else if (msg.type === "open") {
					setState((s) => (s === "connecting" ? "streaming" : s));
				} else if (msg.type === "done") {
					doneRef.current = true;
					setState("done");
					es.close();
				}
			} catch {
				/* ignore malformed frame */
			}
		};
		// EventSource fires `onerror` on a NORMAL server close too, so don't treat a
		// post-`done` (or post-stream) close as a failure — only surface an error if
		// we never got past the initial connect.
		es.onerror = () => {
			es.close();
			if (doneRef.current) return;
			setState((s) => (s === "connecting" ? "error" : "done"));
		};
		return () => es.close();
	}, [runId, trialId]);

	// Finished/ended with turns already shown → keep them with a handoff note (the
	// archived Conversation below is the full replay). Nothing streamed → step aside.
	if (state === "done" || state === "error") {
		if (turns.length === 0) return null;
	}

	const label =
		state === "streaming"
			? "● streaming"
			: state === "done"
				? "✓ finished — full replay in Conversation below (reload if needed)"
				: state === "error"
					? "stream ended"
					: "connecting…";

	return (
		<>
			<h2 className="mt-7 flex items-center gap-2 text-base font-semibold">
				Live build
				<span className="font-normal text-muted-foreground">({label})</span>
			</h2>
			<Card className="mt-2">
				<CardContent className="space-y-2 px-3 pb-3 pt-3">
					{turns.length === 0 ? (
						<p className="text-[12px] text-muted-foreground">
							waiting for the agent to start…
						</p>
					) : (
						turns.map((turn, i) => (
							<TurnBlock key={`live-${i}-${turn.kind}`} turn={turn} />
						))
					)}
				</CardContent>
			</Card>
		</>
	);
}

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

interface Inventory {
	trialId: string;
	files: { path: string; bytes: number }[];
	totalBytes: number;
	truncated: boolean;
	vendoredPresent: string[];
	coldStartContract: string[];
	hasSetupScript: boolean;
	hasStartScript: boolean;
	blindCopyPresent: boolean;
	grades: { adherence: number | null; quality: number | null } | null;
	target: string | null;
	web: boolean;
}

interface PreviewRec {
	state: "starting" | "ready" | "failed" | "stopped";
	url: string | null;
	trust: "sandboxed" | "host-unsafe";
	router: string;
	error?: string;
}

/** Read-only Artifacts audit panel + the Demo control (artifact-preview). */
function Artifacts({ runId, trialId }: { runId: string; trialId: string }) {
	const inv = useFetch<Inventory>(
		`/api/runs/${runId}/trials/${trialId}/inventory`,
	);
	const [showFiles, setShowFiles] = useState(false);
	if (!inv || (inv as { error?: string }).error) return null;

	const fmtBytes = (b: number) =>
		b > 1024 * 1024
			? `${(b / 1024 / 1024).toFixed(1)} MB`
			: b > 1024
				? `${(b / 1024).toFixed(0)} KB`
				: `${b} B`;

	return (
		<>
			<h2 className="mt-7 flex scroll-mt-16 items-center gap-2 text-base font-semibold">
				Artifacts
				<span className="font-normal text-muted-foreground">
					(what the agent built — read-only)
				</span>
			</h2>
			<Card className="mt-2">
				<CardContent className="px-3 pb-3 pt-3">
					<Demo runId={runId} trialId={trialId} web={inv.web} />

					<div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
						<Stat label="Files" value={`${inv.files.length}${inv.truncated ? "+" : ""}`} />
						<Stat label="Size" value={fmtBytes(inv.totalBytes)} />
						<Stat
							label="Cold-start"
							value={`${inv.hasSetupScript ? "setup.sh" : "—"} / ${inv.hasStartScript ? "start.sh" : "—"}`}
						/>
						<Stat label="Blind copy" value={inv.blindCopyPresent ? "✓ scrubbed" : "—"} />
					</div>

					{inv.vendoredPresent.length > 0 && (
						<p className="mt-2 text-[12px] text-muted-foreground">
							deps installed: {inv.vendoredPresent.join(", ")}
						</p>
					)}

					{inv.coldStartContract.length > 0 && (
						<div className="mt-3">
							<p className="text-[12px] font-semibold text-muted-foreground">
								Cold-start contract
							</p>
							<ul className="mt-1 text-[12px] text-muted-foreground">
								{inv.coldStartContract.map((c, i) => (
									<li key={`${i}-${c.slice(0, 24)}`}>• {c}</li>
								))}
							</ul>
						</div>
					)}

					<button
						type="button"
						onClick={() => setShowFiles((v) => !v)}
						className="mt-3 text-[12px] text-muted-foreground hover:text-primary-hover"
					>
						{showFiles ? "▼" : "▶"} file tree ({inv.files.length})
					</button>
					{showFiles && (
						<div className="mt-1 max-h-72 overflow-y-auto rounded border border-border bg-muted/30 p-2 font-mono text-[11px]">
							{inv.files.map((f) => (
								<div key={f.path} className="flex justify-between gap-4">
									<span className="truncate">{f.path}</span>
									<span className="shrink-0 text-muted-foreground">
										{fmtBytes(f.bytes)}
									</span>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			<div className="font-medium">{value}</div>
		</div>
	);
}

/** Start/stop an isolated live demo (web) or captured cold-start run (non-web). */
function Demo({
	runId,
	trialId,
	web,
}: {
	runId: string;
	trialId: string;
	web: boolean;
}) {
	const [rec, setRec] = useState<PreviewRec>();
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string>();

	const post = (path: string) =>
		fetch(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ runId, trialId }),
		}).then((r) => r.json());

	const start = () => {
		setBusy(true);
		setNote(undefined);
		post("/api/preview/start")
			.then((d: PreviewRec & { refused?: string; error?: string }) => {
				if (d.refused || d.error) setNote(d.refused ?? d.error);
				else setRec(d);
			})
			.catch((e) => setNote(String(e)))
			.finally(() => setBusy(false));
	};
	const stop = () => {
		setBusy(true);
		post("/api/preview/stop")
			.then(() => setRec(undefined))
			.finally(() => setBusy(false));
	};

	const running = rec && rec.state !== "stopped" && rec.state !== "failed";

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
			<span className="text-[13px] font-medium">
				{web ? "Live demo" : "Cold-start run"}
			</span>
			{!running ? (
				<button
					type="button"
					disabled={busy}
					onClick={start}
					className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
				>
					{busy ? "starting…" : web ? "▶ Start demo" : "▶ Run cold-start"}
				</button>
			) : (
				<>
					{rec?.url ? (
						<a
							href={rec.url}
							target="_blank"
							rel="noreferrer"
							className="rounded-md border border-border px-2.5 py-1 text-[12px] text-primary-hover hover:bg-muted"
						>
							open {rec.url} ↗
						</a>
					) : (
						<Badge variant="ok">cold-start captured</Badge>
					)}
					<Badge variant="outline">{rec?.trust}</Badge>
					<button
						type="button"
						disabled={busy}
						onClick={stop}
						className="rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50"
					>
						{busy ? "stopping…" : "Stop"}
					</button>
				</>
			)}
			{rec?.state === "failed" && (
				<Badge variant="danger">cold-start failed — see logs</Badge>
			)}
			{note && <span className="text-[12px] text-warn">{note}</span>}
		</div>
	);
}
