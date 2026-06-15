import { useEffect, useState } from "react";
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
import type { RunSummary } from "../lib/api";

interface QueueEntry {
	runId: string;
	kind: "dry" | "live";
	status: "running" | "completed" | "error" | "cancelled";
	startedAt: string;
	candidates: string[];
	trials: Record<string, string>;
	costUsdSoFar: number;
	stage?: string;
	error?: string;
}

type RowStatus =
	| "running"
	| "completed"
	| "error"
	| "cancelled"
	| "unsupported";

interface Row {
	runId: string;
	status: RowStatus;
	stage?: string;
	kind?: "dry" | "live";
	candidates: string[];
	trialsLabel: string;
	cost?: number;
	link: boolean;
	error?: string;
	target?: { name: string; title: string } | null;
	/** Epoch ms parsed from the run id timestamp (for sorting), or null. */
	ts: number | null;
}

/** Extract the timestamp embedded in a run id (`run-2026-06-15T14-26-00-596Z…`,
 *  including `-dry` and `combined:run-…` ids — the first match is used) as epoch
 *  ms. More reliable than string-sorting run ids across suffixes/prefixes. */
function runTs(runId: string): number | null {
	const m = runId.match(
		/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/,
	);
	if (!m) return null;
	const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
	return Number.isNaN(t) ? null : t;
}

const fmtRunDate = (ts: number | null) =>
	ts == null
		? "—"
		: new Date(ts).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});

const STATUS_VARIANT: Record<RowStatus, "warn" | "ok" | "danger" | "outline"> = {
	running: "warn",
	completed: "ok",
	error: "danger",
	cancelled: "outline",
	unsupported: "outline",
};

/** Merge historical runs from disk (/api/runs) with this session's live jobs
 *  (/api/queue): disk runs seed the list; queue entries overlay live status. */
function merge(disk: RunSummary[], queue: QueueEntry[]): Row[] {
	const byId = new Map<string, Row>();
	for (const r of disk) {
		const cands = r.summary?.scores.map((s) => s.candidate) ?? [];
		const total = r.summary
			? cands.length * r.summary.config.trialsPerCandidate
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
		});
	}
	for (const e of queue) {
		byId.set(e.runId, {
			runId: e.runId,
			status: e.status,
			stage: e.stage,
			kind: e.kind,
			candidates: e.candidates,
			trialsLabel:
				Object.entries(e.trials)
					.map(([id, s]) => `${id}:${s}`)
					.join("  ") || "—",
			cost: e.kind === "live" ? e.costUsdSoFar : undefined,
			link: e.status === "completed",
			error: e.error,
			// Live queue entries don't carry the target; keep the disk-resolved one.
			target: byId.get(e.runId)?.target ?? null,
			ts: runTs(e.runId),
		});
	}
	return [...byId.values()];
}

/** All runs: historical from disk + live status for studio-launched jobs. */
export function Runs() {
	const [queue, setQueue] = useState<QueueEntry[]>([]);
	const [disk, setDisk] = useState<RunSummary[]>([]);
	const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

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

	const cancel = (runId: string) =>
		fetch("/api/cancel", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ runId }),
		}).catch(() => {});

	// Sort by the run's timestamp; nulls (unparseable ids) sink to the bottom.
	const rows = merge(disk, queue).sort((a, b) => {
		const av = a.ts ?? -Infinity;
		const bv = b.ts ?? -Infinity;
		return sortDir === "desc" ? bv - av : av - bv;
	});

	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">Runs</h1>
			<p className="mt-1 text-[13px] text-muted-foreground">
				All runs — historical from disk plus live status for studio-launched
				jobs. Completed runs link to their scorecard.
			</p>
			{rows.length === 0 ? (
				<p className="mt-4 text-muted-foreground">
					No runs yet — start one from{" "}
					<a href="/configure" className="text-primary-hover hover:underline">
						Configure
					</a>
					.
				</p>
			) : (
				<Card className="mt-3">
					<CardContent className="px-2 pb-2 pt-2">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Run</TableHead>
									<TableHead>
										<button
											type="button"
											onClick={() =>
												setSortDir((d) => (d === "desc" ? "asc" : "desc"))
											}
											className="inline-flex items-center gap-1 uppercase hover:text-foreground"
											title="Sort by date/time"
										>
											Date / time
											<span aria-hidden>{sortDir === "desc" ? "▼" : "▲"}</span>
										</button>
									</TableHead>
									<TableHead>App / PRD</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Candidates</TableHead>
									<TableHead>Trials</TableHead>
									<TableHead>Cost</TableHead>
									<TableHead>Mode</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((e) => (
									<TableRow key={e.runId}>
										<TableCell>
											{e.link ? (
												<a
													href={`/runs/${e.runId}`}
													className="font-mono text-[12px] text-primary-hover underline decoration-primary-hover/40 underline-offset-2 hover:decoration-primary-hover"
												>
													{e.runId}
												</a>
											) : (
												<span className="font-mono text-[12px]">{e.runId}</span>
											)}
										</TableCell>
										<TableCell className="whitespace-nowrap font-mono text-[12px] text-muted-foreground">
											{fmtRunDate(e.ts)}
										</TableCell>
										<TableCell className="text-[13px]">
											{e.target ? (
												<>
													{e.target.title}{" "}
													<span className="font-mono text-[11px] text-muted-foreground">
														({e.target.name})
													</span>
												</>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											<span className="inline-flex items-center gap-2">
												{e.status === "running" && (
													<span
														role="status"
														aria-label="running"
														className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
													/>
												)}
												<Badge variant={STATUS_VARIANT[e.status]}>
													{e.status === "running" && e.stage
														? e.stage
														: e.status}
												</Badge>
											</span>
											{e.error && (
												<span className="ml-2 text-[12px] text-danger">
													{e.error}
												</span>
											)}
										</TableCell>
										<TableCell className="text-[13px] text-muted-foreground">
											{e.candidates.join(", ") || "—"}
										</TableCell>
										<TableCell className="font-mono text-[12px]">
											{e.trialsLabel}
										</TableCell>
										<TableCell className="font-mono text-[12px]">
											{e.cost != null ? `$${e.cost.toFixed(2)}` : "—"}
										</TableCell>
										<TableCell>
											{e.kind ? (
												<Badge
													variant={e.kind === "dry" ? "outline" : "default"}
												>
													{e.kind === "dry" ? "dry run" : "live"}
												</Badge>
											) : (
												<span className="text-[12px] text-muted-foreground">
													—
												</span>
											)}
										</TableCell>
										<TableCell>
											{e.status === "running" && (
												<button
													type="button"
													className="rounded-md border border-border px-2 py-1 text-[12px] text-foreground hover:bg-muted"
													onClick={() => cancel(e.runId)}
												>
													Cancel
												</button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</>
	);
}
