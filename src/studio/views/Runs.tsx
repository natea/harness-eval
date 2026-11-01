import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
	ALL_APPS,
	type AppRef,
	appOptions,
	effectiveApp,
	matchesApp,
	useAppParam,
} from "../../app-filter";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../components/ui/tooltip";
import type { RunSummary } from "../lib/api";
import { btn, fmtRunDate, fmtUsd, PageHeader, runTs } from "./shared";

interface QueueEntry {
	runId: string;
	kind: "dry" | "live";
	status: "running" | "completed" | "error" | "cancelled" | "interrupted";
	startedAt: string;
	candidates: string[];
	trials: Record<string, string>;
	costUsdSoFar: number;
	stage?: string;
	error?: string;
	regradable?: boolean;
}

type RowStatus =
	| "running"
	| "completed"
	| "error"
	| "cancelled"
	| "interrupted"
	| "unsupported";

interface Row {
	runId: string;
	status: RowStatus;
	stage?: string;
	kind?: "dry" | "live";
	candidates: string[];
	trialsLabel: string;
	/** Per-trial id:status breakdown, shown on hover (run-state runs only). */
	trialsDetail?: string;
	cost?: number;
	link: boolean;
	error?: string;
	target?: AppRef | null;
	/** Epoch ms parsed from the run id timestamp (for sorting), or null. */
	ts: number | null;
	/** Built-but-ungraded trials remain → show "Resume grading". */
	regradable?: boolean;
}

const STATUS_VARIANT: Record<RowStatus, "warn" | "ok" | "danger" | "outline"> =
	{
		running: "warn",
		completed: "ok",
		error: "danger",
		cancelled: "outline",
		interrupted: "danger",
		unsupported: "outline",
	};

/** Merge historical runs from disk (/api/runs) with this session's live jobs
 *  (/api/queue): disk runs seed the list; queue entries overlay live status. */
function merge(disk: RunSummary[], queue: QueueEntry[]): Row[] {
	const byId = new Map<string, Row>();
	for (const r of disk) {
		const scored = r.summary?.scores.map((s) => s.candidate) ?? [];
		// Brownfield runs carry candidates and a trial count but no scores.
		const cands = scored.length ? scored : (r.summary?.candidates ?? []);
		const total = r.summary
			? (r.summary.trialCount ??
				cands.length * r.summary.config.trialsPerCandidate)
			: 0;
		byId.set(r.runId, {
			runId: r.runId,
			status: r.summary ? "completed" : r.error ? "error" : "unsupported",
			candidates: cands,
			trialsLabel: total ? `${total}` : "—",
			link: Boolean(r.summary),
			error: r.error,
			target: r.summary?.target ?? null,
			ts: runTs(r.runId),
			regradable: r.regradable,
			cost: r.summary?.costUsd,
			// Disk runs don't record kind; derive it (combined runs have no mode).
			kind: r.runId.startsWith("combined:")
				? undefined
				: r.runId.endsWith("-dry")
					? "dry"
					: "live",
		});
	}
	for (const e of queue) {
		byId.set(e.runId, {
			runId: e.runId,
			status: e.status,
			stage: e.stage,
			kind: e.kind,
			candidates: e.candidates,
			// Consistent count (like disk runs), with the per-trial breakdown on
			// hover — not the long inline "id:status …" string.
			trialsLabel: Object.keys(e.trials).length
				? `${Object.values(e.trials).filter((s) => s === "completed").length}/${Object.keys(e.trials).length}`
				: "—",
			trialsDetail:
				Object.entries(e.trials)
					.map(([id, s]) => `${id}: ${s}`)
					.join("\n") || undefined,
			cost: e.kind === "live" ? e.costUsdSoFar : undefined,
			link: e.status === "completed",
			error:
				e.error ??
				(e.status === "interrupted"
					? "owner process died — recover: scripts/grade-trial.ts then scripts/finalize-run.ts"
					: undefined),
			// Live queue entries don't carry the target; keep the disk-resolved one.
			target: byId.get(e.runId)?.target ?? null,
			ts: runTs(e.runId),
			regradable: e.regradable,
		});
	}
	return [...byId.values()];
}

/** All runs: historical from disk + live status for studio-launched jobs. */
export function Runs() {
	const [queue, setQueue] = useState<QueueEntry[]>([]);
	const [disk, setDisk] = useState<RunSummary[]>([]);
	const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
	const [rawApp, setApp] = useAppParam();
	// Runs we've asked to cancel — shows "cancelling…" until the status flips
	// (cancellation is cooperative; an in-flight build finishes its step first).
	const [cancelling, setCancelling] = useState<Set<string>>(new Set());
	const [regrading, setRegrading] = useState<Set<string>>(new Set());

	useEffect(() => {
		const pollQueue = () =>
			fetch("/api/queue")
				.then((r) => r.json())
				.then((d) => setQueue(d as QueueEntry[]))
				.catch(() => {});
		const pollDisk = () =>
			fetch("/api/runs")
				.then((r) => r.json())
				.then((d) => setDisk(d as RunSummary[]))
				.catch(() => {});
		pollQueue();
		pollDisk();
		// Live jobs change fast; the disk index changes rarely.
		const q = setInterval(pollQueue, 1500);
		const d = setInterval(pollDisk, 10_000);
		return () => {
			clearInterval(q);
			clearInterval(d);
		};
	}, []);

	const cancel = (runId: string) => {
		setCancelling((s) => new Set(s).add(runId));
		fetch("/api/cancel", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ runId }),
		})
			.then((r) => r.json())
			.then((out) => {
				// If the server couldn't cancel (already terminal), drop the pending
				// state so the button returns instead of spinning forever.
				if (!out?.ok)
					setCancelling((s) => {
						const n = new Set(s);
						n.delete(runId);
						return n;
					});
			})
			.catch(() =>
				setCancelling((s) => {
					const n = new Set(s);
					n.delete(runId);
					return n;
				}),
			);
	};

	const regrade = (runId: string) => {
		setRegrading((s) => new Set(s).add(runId));
		const drop = () =>
			setRegrading((s) => {
				const n = new Set(s);
				n.delete(runId);
				return n;
			});
		fetch("/api/regrade", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ runId }),
		})
			.then((r) => r.json())
			.then((out) => {
				// The worker writes run-state; once it's running, the regradable flag
				// clears on the next poll. Drop our optimistic flag if it failed.
				if (!out?.ok) drop();
			})
			.catch(drop);
	};

	// Sort by the run's timestamp; nulls (unparseable ids) sink to the bottom.
	const allRows = merge(disk, queue).sort((a, b) => {
		const av = a.ts ?? -Infinity;
		const bv = b.ts ?? -Infinity;
		return sortDir === "desc" ? bv - av : av - bv;
	});
	// Distinct apps present across runs, for the filter dropdown.
	const apps = appOptions(allRows.map((r) => r.target));
	const appFilter = effectiveApp(rawApp, apps);
	const rows = allRows.filter((r) => matchesApp(r.target, appFilter));

	const spin = (
		<span
			aria-hidden
			className="inline-block size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
		/>
	);

	return (
		<>
			<PageHeader
				title="Runs"
				description="Every run on disk plus live status for runs launched here. Completed runs open as a trace of their trials."
				actions={
					<>
						{apps.length > 0 && (
							<Select value={appFilter} onValueChange={setApp}>
								<SelectTrigger
									aria-label="App"
									className="h-8 w-auto min-w-[200px] gap-2"
								>
									<span className="text-muted-foreground">App</span>
									<SelectValue placeholder="All" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL_APPS}>All</SelectItem>
									{apps.map((o) => (
										<SelectItem key={o.value} value={o.value}>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						<a href="/configure" className={btn.primary}>
							<Plus className="size-3.5" />
							New run
						</a>
					</>
				}
			/>
			{rows.length === 0 ? (
				<Card className="grid place-items-center gap-2 px-6 py-16 text-center">
					<h2 className="m-0 text-[15px] font-semibold">
						{allRows.length === 0 ? "No runs yet" : "No runs for this app"}
					</h2>
					<p className="m-0 max-w-[48ch] text-[13.5px] text-muted-foreground">
						{allRows.length === 0
							? "Launch a dry run first to check the setup costs nothing, then a real run."
							: "Pick another app, or start a run for this one."}
					</p>
					<a href="/configure" className={`${btn.primary} mt-2`}>
						<Plus className="size-3.5" />
						New run
					</a>
				</Card>
			) : (
				<Card className="overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="pl-5">Run</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Frameworks</TableHead>
								<TableHead className="text-right">Trials</TableHead>
								<TableHead className="text-right">Spend</TableHead>
								<TableHead className="text-right">
									<button
										type="button"
										onClick={() =>
											setSortDir((d) => (d === "desc" ? "asc" : "desc"))
										}
										className="inline-flex items-center gap-1 hover:text-foreground"
										aria-label={`Sort by date, ${sortDir === "desc" ? "newest" : "oldest"} first`}
									>
										Started
										{sortDir === "desc" ? (
											<ArrowDown className="size-3" />
										) : (
											<ArrowUp className="size-3" />
										)}
									</button>
								</TableHead>
								<TableHead className="pr-5" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((e) => {
								const href = e.link
									? `/runs/${e.runId}`
									: e.status === "running" &&
											e.kind === "live" &&
											e.candidates[0]
										? // Watch the (first) building trial live (live-build-stream).
											`/runs/${e.runId}/trials/${e.candidates[0]}-t1`
										: null;
								const title =
									e.target?.title ?? (e.kind === "dry" ? "Dry run" : "Run");
								return (
									<TableRow key={e.runId}>
										<TableCell className="max-w-[360px] py-3 pl-5">
											{href ? (
												<a
													href={href}
													className="block truncate font-medium text-foreground no-underline hover:underline"
												>
													{title}
												</a>
											) : (
												<span className="block truncate font-medium">
													{title}
												</span>
											)}
											<span className="block truncate font-mono text-[11.5px] text-muted-foreground">
												{e.runId}
											</span>
										</TableCell>
										<TableCell>
											<span className="inline-flex items-center gap-2">
												{e.status === "running" && (
													<span className="relative flex size-2">
														<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
														<span className="relative inline-flex size-2 rounded-full bg-primary" />
													</span>
												)}
												<Badge variant={STATUS_VARIANT[e.status]}>
													{e.status === "running" && e.stage
														? e.stage
														: e.status}
												</Badge>
												{e.kind === "dry" && (
													<Badge variant="outline">dry</Badge>
												)}
												{e.error && (
													<Tooltip>
														<TooltipTrigger asChild>
															<button
																type="button"
																className="cursor-help text-[12px] text-danger underline decoration-dotted underline-offset-2"
															>
																Why?
															</button>
														</TooltipTrigger>
														<TooltipContent className="max-w-[420px] whitespace-pre-wrap break-words">
															{e.error}
														</TooltipContent>
													</Tooltip>
												)}
											</span>
										</TableCell>
										<TableCell className="max-w-[280px] truncate text-[13px] text-muted-foreground">
											{e.candidates.join(", ") || "—"}
										</TableCell>
										<TableCell className="text-right font-mono text-[12.5px]">
											{e.trialsDetail ? (
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
															{e.trialsLabel}
														</span>
													</TooltipTrigger>
													<TooltipContent className="whitespace-pre-line">
														{e.trialsDetail}
													</TooltipContent>
												</Tooltip>
											) : (
												e.trialsLabel
											)}
										</TableCell>
										<TableCell className="text-right font-mono text-[12.5px]">
											{fmtUsd(e.cost)}
										</TableCell>
										<TableCell className="whitespace-nowrap text-right text-[12.5px] text-muted-foreground">
											{fmtRunDate(e.ts)}
										</TableCell>
										<TableCell className="pr-5 text-right">
											{e.status === "running" ? (
												cancelling.has(e.runId) ? (
													<span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
														{spin}
														Cancelling…
													</span>
												) : (
													<button
														type="button"
														className={btn.secondary}
														onClick={() => cancel(e.runId)}
													>
														Cancel
													</button>
												)
											) : e.regradable ? (
												regrading.has(e.runId) ? (
													<span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
														{spin}
														Resuming…
													</span>
												) : (
													<button
														type="button"
														className={`${btn.secondary} whitespace-nowrap`}
														title="Grade built-but-ungraded trials on your subscription (no rebuild)"
														onClick={() => regrade(e.runId)}
													>
														Resume grading
													</button>
												)
											) : null}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</Card>
			)}
		</>
	);
}
