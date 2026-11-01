import { Check, Copy, Play } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import type { Weights } from "../../types";
import { Card } from "../components/ui/card";
import { DEFAULT_WEIGHTS, useFetch } from "../lib/api";
import { cn } from "../lib/utils";
import {
	btn,
	Callout,
	PageHeader,
	SectionTitle,
	WeightControls,
} from "./shared";

interface TargetOption {
	name: string;
	summary: string;
	shape: string;
	expectedUI: string;
}

interface Options {
	targets: string[];
	targetCatalog?: TargetOption[];
	candidates: { id: string; name: string; harnesses: string[] }[];
	harnesses: string[];
	models: { name: string; provider: string }[];
	providers: string[];
	providerStatus?: {
		id: string;
		requires?: string;
		configured: boolean;
	}[];
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
	"h-8 w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Labelled form field with optional hint line. */
function Field({
	id,
	label,
	hint,
	children,
}: {
	id?: string;
	label: string;
	hint?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-[13px] font-medium">
				{label}
			</label>
			{children}
			{hint && (
				<p className="m-0 text-[12.5px] text-muted-foreground">{hint}</p>
			)}
		</div>
	);
}

export function Configure() {
	const opts = useFetch<Options>("/api/options");
	const [target, setTarget] = useState("");
	const [candidates, setCandidates] = useState<string[]>([]);
	const [harness, setHarness] = useState("claude-code");
	const [workerModel, setWorkerModel] = useState("claude-opus-4-6");
	const [judgeModel, setJudgeModel] = useState("claude-sonnet-4-6");
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
				judgeModel,
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
			judgeModel,
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
		judgeModel,
		provider,
		trials,
		concurrency,
		weights,
		grade,
	]);

	if (!opts)
		return (
			<p className="text-[13px] text-muted-foreground">Loading options…</p>
		);

	const toggleCandidate = (id: string) =>
		setCandidates((cs) =>
			cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id],
		);
	const meta = opts.targetCatalog?.find((c) => c.name === target);
	const runnable = !!vr?.command && !(vr.errors && vr.errors.length > 0);

	return (
		<>
			<PageHeader
				title="New run"
				description="Choose what varies. Everything else is held fixed, and the spec and test plan are hash-frozen when the run starts."
			/>

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
				<div className="grid min-w-0 grid-cols-1 content-start gap-6">
					<Card className="grid gap-5 p-5">
						<SectionTitle className="mb-0">Target</SectionTitle>
						<Field
							id="target"
							label="Spec to build"
							hint={
								meta ? (
									<>
										{meta.summary}{" "}
										<span className="font-mono text-[11.5px]">
											{meta.shape} · ui: {meta.expectedUI}
										</span>
									</>
								) : undefined
							}
						>
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
						</Field>
					</Card>

					<Card className="overflow-hidden">
						<div className="px-5 pt-4">
							<SectionTitle
								aside={`${candidates.length} selected · identical prompt for each`}
							>
								Frameworks
							</SectionTitle>
						</div>
						<div className="grid border-t border-border sm:grid-cols-2">
							{opts.candidates.map((c) => {
								const supported = c.harnesses.includes(harness);
								const on = candidates.includes(c.id);
								return (
									<label
										key={c.id}
										className={cn(
											"flex cursor-pointer items-center gap-3 border-b border-border px-5 py-3 transition-colors sm:odd:border-r",
											on ? "bg-primary-soft/50" : "hover:bg-muted/60",
											!supported && "cursor-not-allowed opacity-50",
										)}
									>
										<input
											type="checkbox"
											className="size-4 accent-[var(--primary)]"
											disabled={!supported}
											checked={on}
											onChange={() => toggleCandidate(c.id)}
										/>
										<span className="min-w-0">
											<span className="block truncate text-[13.5px] font-medium">
												{c.name || c.id}
											</span>
											<span className="block truncate font-mono text-[11.5px] text-muted-foreground">
												{supported ? c.id : `no ${harness} support`}
											</span>
										</span>
									</label>
								);
							})}
						</div>
					</Card>

					<Card className="grid gap-5 p-5">
						<SectionTitle className="mb-0">Environment</SectionTitle>
						<div className="grid gap-5 sm:grid-cols-2">
							<Field id="harness" label="Harness">
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
							</Field>
							<Field id="provider" label="Sandbox provider">
								<select
									id="provider"
									className={selectCls}
									value={provider}
									onChange={(e) => setProvider(e.target.value)}
								>
									{opts.providers.map((p) => {
										const st = opts.providerStatus?.find((s) => s.id === p);
										const unconfigured = st ? !st.configured : false;
										return (
											<option key={p} value={p} disabled={unconfigured}>
												{p}
												{unconfigured ? ` (missing ${st?.requires})` : ""}
											</option>
										);
									})}
								</select>
							</Field>
							<Field id="model" label="Worker model">
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
							</Field>
							<Field
								id="judge"
								label="Judge model"
								hint={
									judgeModel === workerModel ? (
										<span className="text-warn">
											Must differ from the worker. A model never grades its own
											work.
										</span>
									) : (
										"Scores code quality on a copy scrubbed of framework markers."
									)
								}
							>
								<select
									id="judge"
									className={selectCls}
									value={judgeModel}
									onChange={(e) => setJudgeModel(e.target.value)}
								>
									{opts.models.map((m) => (
										<option key={m.name} value={m.name}>
											{m.name} ({m.provider})
										</option>
									))}
								</select>
							</Field>
						</div>
					</Card>

					<Card className="grid gap-5 p-5">
						<SectionTitle className="mb-0">Trials and grading</SectionTitle>
						<div className="grid gap-5 sm:grid-cols-3">
							<Field
								id="trials"
								label="Trials per framework"
								hint="3+ makes a ranking separable more often."
							>
								<input
									id="trials"
									type="number"
									min={1}
									className={selectCls}
									value={trials}
									onChange={(e) => setTrials(Number(e.target.value))}
								/>
							</Field>
							<Field
								id="concurrency"
								label="Concurrency"
								hint={
									provider === "daytona" && concurrency > 1 ? (
										<span className="text-warn">
											Daytona's free tier allows about 1.
										</span>
									) : undefined
								}
							>
								<input
									id="concurrency"
									type="number"
									min={1}
									className={selectCls}
									value={concurrency}
									onChange={(e) =>
										setConcurrency(Math.max(1, Number(e.target.value)))
									}
								/>
							</Field>
							<div className="grid gap-1.5">
								<span className="text-[13px] font-medium">Grading</span>
								<label className="flex h-8 items-center gap-2 text-[13px]">
									<input
										type="checkbox"
										className="size-4 accent-[var(--primary)]"
										checked={grade}
										onChange={(e) => setGrade(e.target.checked)}
									/>
									Grade after build
								</label>
								<p className="m-0 text-[12.5px] text-muted-foreground">
									Evaluator + judge. Extra spend.
								</p>
							</div>
						</div>
					</Card>

					<Card className="overflow-hidden">
						<div className="px-5 pt-4">
							<SectionTitle aside="Used for the composite in this run's report">
								Scoring weights
							</SectionTitle>
						</div>
						<WeightControls inline weights={weights} onChange={setWeights} />
					</Card>
				</div>

				<aside className="xl:sticky xl:top-8 xl:self-start">
					<Card className="grid gap-4 p-5">
						<div>
							<h2 className="m-0 text-[14px] font-semibold">Run summary</h2>
							<p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
								{meta?.name ?? target} · {candidates.length} framework
								{candidates.length === 1 ? "" : "s"} · {provider}
							</p>
						</div>
						{vr?.budget && (
							<div className="grid gap-1 rounded-md bg-muted p-3">
								<span className="text-[12px] text-muted-foreground">
									Spend cap
								</span>
								<span className="font-mono text-[26px] font-medium leading-none tracking-[-0.02em]">
									${vr.budget.maxCostUsd.toFixed(0)}
								</span>
								<span className="text-[12.5px] text-muted-foreground">
									{vr.budget.totalTrials} trial
									{vr.budget.totalTrials === 1 ? "" : "s"} · at most{" "}
									{vr.budget.wallClockHours.toFixed(1)}h
								</span>
								{vr.budget.note && (
									<span className="text-[12px] text-muted-foreground">
										{vr.budget.note}
									</span>
								)}
							</div>
						)}
						{vr?.errors && vr.errors.length > 0 && (
							<div className="rounded-md border border-danger/25 bg-danger-bg p-3 text-[13px]">
								<p className="m-0 mb-1 font-medium text-danger">
									Not runnable yet
								</p>
								<ul className="m-0 grid gap-1 pl-4 text-foreground">
									{vr.errors.map((e) => (
										<li key={e}>{e}</li>
									))}
								</ul>
							</div>
						)}
						<div className="grid gap-2">
							<button
								type="button"
								disabled={busy || !runnable}
								className={`${btn.primary} h-9 justify-center`}
								onClick={() => launch(false, false)}
							>
								<Play className="size-3.5" />
								Launch real run
							</button>
							<button
								type="button"
								disabled={busy || !runnable}
								className={`${btn.secondary} h-9 justify-center`}
								onClick={() => launch(true, false)}
							>
								Dry run, no spend
							</button>
							<p className="m-0 text-[12px] text-muted-foreground">
								Real runs bill your subscription and ask for confirmation first.
								A dry run fakes the build on a worktree.
							</p>
						</div>
						{launchErr && (
							<Callout tone="danger" title="Launch failed.">
								{launchErr}
							</Callout>
						)}
						{vr?.command && (
							<div className="grid gap-1.5 border-t border-border pt-4">
								<span className="flex items-center justify-between text-[12px] text-muted-foreground">
									Equivalent CLI command
									<button
										type="button"
										className={`${btn.ghost} h-6 px-1.5 text-[12px]`}
										onClick={() => {
											navigator.clipboard
												?.writeText(vr.command ?? "")
												.catch(() => {});
											setCopied(true);
											setTimeout(() => setCopied(false), 1500);
										}}
									>
										{copied ? (
											<Check className="size-3.5" />
										) : (
											<Copy className="size-3.5" />
										)}
										{copied ? "Copied" : "Copy"}
									</button>
								</span>
								<pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-[11.5px] text-foreground">
									{vr.command}
								</pre>
							</div>
						)}
					</Card>
				</aside>
			</div>

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
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
		>
			<Card className="w-full max-w-md p-6 shadow-[0_16px_48px_rgba(0,0,0,0.25)]">
				<h2 id="confirm-title" className="m-0 text-[17px] font-semibold">
					Start a real run?
				</h2>
				<p className="m-0 mt-1.5 text-[13.5px] text-muted-foreground">
					This bills your subscription. The run stops at its spend cap.
				</p>
				<dl className="m-0 mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13.5px]">
					<dt className="text-muted-foreground">Provider</dt>
					<dd className="m-0 text-right font-medium">{provider}</dd>
					<dt className="text-muted-foreground">Trials</dt>
					<dd className="m-0 text-right font-mono">{budget.totalTrials}</dd>
					<dt className="text-muted-foreground">Spend cap</dt>
					<dd className="m-0 text-right font-mono">
						${budget.maxCostUsd.toFixed(0)}
					</dd>
					<dt className="text-muted-foreground">Wall-clock cap</dt>
					<dd className="m-0 text-right font-mono">
						{budget.wallClockHours.toFixed(1)}h
					</dd>
					<dt className="text-muted-foreground">Grade after build</dt>
					<dd className="m-0 text-right">{grade ? "Yes" : "No"}</dd>
				</dl>
				<div className="mt-6 flex justify-end gap-2">
					<button type="button" className={btn.secondary} onClick={onCancel}>
						Cancel
					</button>
					<button
						type="button"
						disabled={busy}
						className={btn.primary}
						onClick={onConfirm}
					>
						Launch, up to ${budget.maxCostUsd.toFixed(0)}
					</button>
				</div>
			</Card>
		</div>
	);
}
