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

interface QueueEntry {
	runId: string;
	dryRun: boolean;
	status: "running" | "completed" | "error";
	startedAt: string;
	candidates: string[];
	trials: Record<string, string>;
	error?: string;
}

const STATUS_VARIANT = {
	running: "warn",
	completed: "ok",
	error: "danger",
} as const;

/** Live status of studio-launched runs (polls /api/queue). */
export function Runs() {
	const [queue, setQueue] = useState<QueueEntry[]>([]);
	useEffect(() => {
		const tick = () =>
			fetch("/api/queue")
				.then((r) => r.json())
				.then((d) => setQueue(d as QueueEntry[]))
				.catch(() => {});
		tick();
		const id = setInterval(tick, 1500);
		return () => clearInterval(id);
	}, []);

	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">Runs</h1>
			<p className="mt-1 text-[13px] text-muted-foreground">
				Studio-launched runs, with live status. Completed runs link to their
				scorecard.
			</p>
			{queue.length === 0 ? (
				<p className="mt-4 text-muted-foreground">
					No studio launches yet — start a dry run from{" "}
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
									<TableHead>Status</TableHead>
									<TableHead>Candidates</TableHead>
									<TableHead>Trials</TableHead>
									<TableHead>Mode</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{queue.map((e) => (
									<TableRow key={e.runId}>
										<TableCell>
											{e.status === "completed" ? (
												<a
													href={`/runs/${e.runId}`}
													className="font-mono text-[12px] text-primary-hover hover:underline"
												>
													{e.runId}
												</a>
											) : (
												<span className="font-mono text-[12px]">{e.runId}</span>
											)}
										</TableCell>
										<TableCell>
											<Badge variant={STATUS_VARIANT[e.status]}>
												{e.status}
											</Badge>
											{e.error && (
												<span className="ml-2 text-[12px] text-danger">
													{e.error}
												</span>
											)}
										</TableCell>
										<TableCell className="text-[13px] text-muted-foreground">
											{e.candidates.join(", ")}
										</TableCell>
										<TableCell className="font-mono text-[12px]">
											{Object.entries(e.trials)
												.map(([id, s]) => `${id}:${s}`)
												.join("  ") || "—"}
										</TableCell>
										<TableCell>
											{e.dryRun && <Badge variant="outline">dry run</Badge>}
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
