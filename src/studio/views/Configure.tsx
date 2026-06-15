import { useEffect, useState } from "react";
import type { Weights } from "../../types";
import { Badge } from "../components/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import { DEFAULT_WEIGHTS, useFetch } from "../lib/api";
import { WeightControls } from "./shared";

interface Options {
	targets: string[];
	candidates: { id: string; name: string; harnesses: string[] }[];
	harnesses: string[];
	models: { name: string; provider: string }[];
	providers: string[];
	defaults: Record<string, unknown>;
}

interface Validation {
	errors: string[];
	command?: string;
	budget?: {
		totalTrials: number;
		maxCostUsd: number;
		wallClockHours: number;
		note: string;
	};
}

const selectCls =
	"rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function Configure() {
	const opts = useFetch<Options>("/api/options");
	const [target, setTarget] = useState("");
	const [candidates, setCandidates] = useState<string[]>([]);
	const [harness, setHarness] = useState("claude-code");
	const [workerModel, setWorkerModel] = useState("claude-opus-4-6");
	const [provider, setProvider] = useState("worktree");
	const [trials, setTrials] = useState(1);
	const [concurrency, setConcurrency] = useState(2);
	const [grade, setGrade] = useState(false);
	const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
	const [vr, setVr] = useState<Validation>();
	const [copied, setCopied] = useState(false);
	const [confirm, setConfirm] = useState<Validation["budget"]>();
	const [launchErr, setLaunchErr] = useState<string>();
	const [busy, setBusy] = useState(false);

	const launch = (dryRun: boolean, confirmed: boolean) => {
		setBusy(true);
		setLaunchErr(undefined);
		fetch("/api/launch", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				target,
				candidates,
				harness,
				workerModel,
				provider: dryRun ? "worktree" : provider,
				trials,
				concurrency,
				weights,
				grade,
				dryRun,
				confirmed,
			}),
		})
			.then((r) => r.json())
			.then(
				(d: {
					runId?: string;
					errors?: string[];
					needsConfirmation?: boolean;
					budget?: Validation["budget"];
				}) => {
					if (d.runId) {
						window.location.href = "/runs";
					} else if (d.needsConfirmation) {
						setConfirm(d.budget);
					} else if (d.errors) {
						setLaunchErr(d.errors.join("; "));
					}
				},
			)
			.catch((e) => setLaunchErr(String(e)))
			.finally(() => setBusy(false));
	};

	// Seed sensible defaults once options load.
	useEffect(() => {
		if (!opts) return;
		setTarget((t) => t || opts.targets[0] || "");
	}, [opts]);

	// Default concurrency per provider — daytona's free tier is concurrency-1, so
	// a multi-trial run at the default (2) overcommits it. Re-defaults on provider
	// change; still adjustable below.
	useEffect(() => {
		setConcurrency(provider === "daytona" ? 1 : 2);
	}, [provider]);

	// Validate on every change via the shared server rules (parity with CLI).
	useEffect(() => {
		const body = {
			target,
			candidates,
			harness,
			workerModel,
			provider,
			trials,
			concurrency,
			weights,
			grade,
		};
		fetch("/api/validate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		})
			.then((r) => r.json())
			.then((d) => setVr(d as Validation))
			.catch(() => setVr(undefined));
	}, [
		target,
		candidates,
		harness,
		workerModel,
		provider,
		trials,
		concurrency,
		weights,
		grade,
	]);

	if (!opts) return <p className="text-muted-foreground">loading…</p>;

	const toggleCandidate = (id: string) =>
		setCandidates((cs) =>
			cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id],
		);

	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">Configure a run</h1>
			<p className="mt-1 text-[13px] text-muted-foreground">
				Build a valid run from the live registries, then launch a real run, a
				zero-spend dry run, or copy the equivalent CLI command.
			</p>

			<div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
				<Card>
					<CardHeader className="pb-1">
						<CardTitle className="text-[13px]">Target & axes</CardTitle>
					</CardHeader>
					<CardContent className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2.5">
						<label htmlFor="target" className="text-[13px]">
							Eval target
						</label>
						<select
							id="target"
							className={selectCls}
							value={target}
							onChange={(e) => setTarget(e.target.value)}
						>
							{opts.targets.map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</select>

						<label htmlFor="harness" className="text-[13px]">
							Harness
						</label>
						<select
							id="harness"
							className={selectCls}
							value={harness}
							onChange={(e) => setHarness(e.target.value)}
						>
							{opts.harnesses.map((h) => (
								<option key={h} value={h}>
									{h}
								</option>
							))}
						</select>

						<label htmlFor="model" className="text-[13px]">
							Worker model
						</label>
						<select
							id="model"
							className={selectCls}
							value={workerModel}
							onChange={(e) => setWorkerModel(e.target.value)}
						>
							{opts.models.map((m) => (
								<option key={m.name} value={m.name}>
									{m.name} ({m.provider})
								</option>
							))}
						</select>

						<label htmlFor="provider" className="text-[13px]">
							Provider
						</label>
						<select
							id="provider"
							className={selectCls}
							value={provider}
							onChange={(e) => setProvider(e.target.value)}
						>
							{opts.providers.map((p) => (
								<option key={p} value={p}>
									{p}
								</option>
							))}
						</select>

						<label htmlFor="trials" className="text-[13px]">
							Trials / candidate
						</label>
						<input
							id="trials"
							type="number"
							min={1}
							className={`${selectCls} w-20`}
							value={trials}
							onChange={(e) => setTrials(Number(e.target.value))}
						/>

						<label htmlFor="concurrency" className="text-[13px]">
							Concurrency
						</label>
						<span className="flex items-center gap-2">
							<input
								id="concurrency"
								type="number"
								min={1}
								className={`${selectCls} w-20`}
								value={concurrency}
								onChange={(e) =>
									setConcurrency(Math.max(1, Number(e.target.value)))
								}
							/>
							{provider === "daytona" && concurrency > 1 && (
								<span className="text-[12px] text-warn">
									daytona free tier is ~1 — higher may be reclaimed
								</span>
							)}
						</span>

						<span className="text-[13px]">Grade</span>
						<label className="flex items-center gap-2 text-[13px] text-muted-foreground">
							<input
								type="checkbox"
								checked={grade}
								onChange={(e) => setGrade(e.target.checked)}
							/>
							run evaluator + judge after build (extra spend)
						</label>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-1">
						<CardTitle className="text-[13px]">
							Frameworks{" "}
							<span className="font-normal text-muted-foreground">
								(every candidate gets the identical prompt)
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-1.5">
						{opts.candidates.map((c) => {
							const supported = c.harnesses.includes(harness);
							return (
								<label
									key={c.id}
									className={`flex items-center gap-2 text-sm ${supported ? "" : "opacity-50"}`}
								>
									<input
										type="checkbox"
										disabled={!supported}
										checked={candidates.includes(c.id)}
										onChange={() => toggleCandidate(c.id)}
									/>
									<span className="font-medium">{c.id}</span>
									{!supported && (
										<Badge variant="outline">no {harness} section</Badge>
									)}
								</label>
							);
						})}
					</CardContent>
				</Card>
			</div>

			<WeightControls weights={weights} onChange={setWeights} />

			{/* Validation + output */}
			{vr?.errors && vr.errors.length > 0 ? (
				<Card className="border-danger-bg">
					<CardContent className="pt-3">
						<p className="mb-1 text-[13px] font-semibold text-danger">
							Not runnable yet:
						</p>
						<ul className="text-[13px] text-muted-foreground">
							{vr.errors.map((e) => (
								<li key={e}>• {e}</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : vr?.command ? (
				<Card>
					<CardContent className="pt-3">
						{vr.budget && (
							<p className="mb-2 text-[13px]">
								<Badge variant="warn" className="mr-2">
									{vr.budget.totalTrials} trial(s) · up to $
									{vr.budget.maxCostUsd.toFixed(0)} · ≤
									{vr.budget.wallClockHours.toFixed(1)}h
								</Badge>
								<span className="text-muted-foreground">{vr.budget.note}</span>
							</p>
						)}
						<div className="flex items-start gap-2">
							<pre className="flex-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[12px] text-foreground">
								{vr.command}
							</pre>
							<button
								type="button"
								className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
								onClick={() => {
									navigator.clipboard?.writeText(vr.command ?? "");
									setCopied(true);
									setTimeout(() => setCopied(false), 1500);
								}}
							>
								{copied ? "copied" : "copy"}
							</button>
						</div>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<button
								type="button"
								disabled={busy}
								className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
								onClick={() => launch(false, false)}
							>
								Launch real run
							</button>
							<button
								type="button"
								disabled={busy}
								className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
								onClick={() => launch(true, false)}
							>
								Dry run (no spend)
							</button>
							<span className="text-[12px] text-muted-foreground">
								Real runs bill your subscription and require confirmation. Dry
								run uses a fake build on worktree.
							</span>
						</div>
						{launchErr && (
							<p className="mt-2 text-[13px] text-danger">⚠ {launchErr}</p>
						)}
					</CardContent>
				</Card>
			) : null}

			{confirm && (
				<ConfirmDialog
					budget={confirm}
					provider={provider}
					grade={grade}
					busy={busy}
					onCancel={() => setConfirm(undefined)}
					onConfirm={() => {
						setConfirm(undefined);
						launch(false, true);
					}}
				/>
			)}
		</>
	);
}

function ConfirmDialog({
	budget,
	provider,
	grade,
	busy,
	onCancel,
	onConfirm,
}: {
	budget: NonNullable<Validation["budget"]>;
	provider: string;
	grade: boolean;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-[15px]">Confirm real run</CardTitle>
				</CardHeader>
				<CardContent className="text-[13px]">
					<p className="mb-3 text-muted-foreground">
						This starts a real evaluation that bills your subscription.
					</p>
					<ul className="mb-4 space-y-1">
						<li>
							Provider: <span className="font-medium">{provider}</span>
						</li>
						<li>
							Trials: <span className="font-medium">{budget.totalTrials}</span>
						</li>
						<li>
							Max spend:{" "}
							<span className="font-medium">
								${budget.maxCostUsd.toFixed(0)}
							</span>{" "}
							· ≤ {budget.wallClockHours.toFixed(1)}h wall-clock
						</li>
						<li>Grading after build: {grade ? "yes" : "no"}</li>
					</ul>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
							onClick={onCancel}
						>
							Cancel
						</button>
						<button
							type="button"
							disabled={busy}
							className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
							onClick={onConfirm}
						>
							Confirm &amp; launch (${budget.maxCostUsd.toFixed(0)})
						</button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
