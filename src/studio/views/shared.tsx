import { ArrowLeft, Check, ChevronRight, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Weights } from "../../types";
import { Card } from "../components/ui/card";
import { Slider } from "../components/ui/slider";
import { TableHead } from "../components/ui/table";
import { InfoTip } from "../components/ui/tooltip";
import { DEFAULT_WEIGHTS, DIM_LABELS, HELP } from "../lib/api";
import { cn } from "../lib/utils";

export const DIM_KEYS = Object.keys(DIM_LABELS) as (keyof Weights)[];

/** Extract the timestamp embedded in a run id (`run-2026-06-15T14-26-00-596Z…`,
 *  including `-dry` and `combined:run-…` ids — the first match is used) as epoch
 *  ms. More reliable than string-sorting run ids across suffixes/prefixes. */
export function runTs(runId: string): number | null {
	const m = runId.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
	if (!m) return null;
	const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
	return Number.isNaN(t) ? null : t;
}

export const fmtRunDate = (ts: number | null): string =>
	ts == null
		? "—"
		: `${new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;

/** One display precision per scoring dimension, used on every surface. Code
 *  quality is a judge median x10, shown whole; the rest carry one decimal. */
export const fmtDim = (k: keyof Weights, v: number): string =>
	k === "codeQuality" ? v.toFixed(0) : v.toFixed(1);

export const fmtUsd = (v: number | undefined | null): string =>
	v == null ? "—" : `$${v.toFixed(2)}`;

export const fmtMin = (ms: number): string =>
	ms >= 3_600_000
		? `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60000)}m`
		: ms >= 60000
			? `${(ms / 60000).toFixed(1)}m`
			: `${Math.round(ms / 1000)}s`;

/** Page title row: title + one-line description on the left, actions right. */
export function PageHeader({
	title,
	description,
	actions,
	back,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	back?: { href: string; label: string };
}) {
	return (
		<header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
			<div className="min-w-0">
				{back && (
					<a
						href={back.href}
						className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted-foreground no-underline hover:text-foreground"
					>
						<ArrowLeft aria-hidden="true" className="size-3.5" />
						{back.label}
					</a>
				)}
				<h1 className="m-0 text-[24px] font-semibold leading-tight tracking-[-0.02em]">
					{title}
				</h1>
				{description && (
					<p className="mt-1.5 max-w-[72ch] text-[14px] text-muted-foreground">
						{description}
					</p>
				)}
			</div>
			{actions && (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			)}
		</header>
	);
}

/** Section heading inside a page. */
export function SectionTitle({
	children,
	aside,
	className,
}: {
	children: ReactNode;
	aside?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mb-3 flex flex-wrap items-baseline justify-between gap-2",
				className,
			)}
		>
			<h2 className="m-0 text-[15px] font-semibold tracking-[-0.01em]">
				{children}
			</h2>
			{aside && (
				<span className="text-[12.5px] text-muted-foreground">{aside}</span>
			)}
		</div>
	);
}

/** Warning callout — used for "not separable" and comparability caveats. */
export function Callout({
	title,
	children,
	tone = "warn",
}: {
	title: ReactNode;
	children?: ReactNode;
	tone?: "warn" | "danger";
}) {
	return (
		<div
			role="note"
			className={cn(
				"flex items-start gap-3 rounded-lg border px-4 py-3 text-[13.5px]",
				tone === "warn"
					? "border-warn/25 bg-warn-bg text-foreground"
					: "border-danger/25 bg-danger-bg text-foreground",
			)}
		>
			<TriangleAlert
				aria-hidden="true"
				className={cn(
					"mt-0.5 size-4 shrink-0",
					tone === "warn" ? "text-warn" : "text-danger",
				)}
			/>
			<p className="m-0">
				<span className="font-semibold">{title}</span>
				{children ? <> {children}</> : null}
			</p>
		</div>
	);
}

/** Primary / secondary button styles as plain classes (links and buttons). */
export const btn = {
	primary:
		"inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background no-underline transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
	secondary:
		"inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground no-underline transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40",
	ghost:
		"inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:bg-secondary hover:text-foreground",
};

/** Read-only context chip: "Label value". */
export function MetaChip({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px]">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium">{children}</span>
		</span>
	);
}

/** Horizontal data bar + monospace value (accent used for data marks only). */
export function Bar({ v }: { v: number }) {
	return (
		<div className="flex items-center gap-2">
			<span
				className="inline-block h-[6px] rounded-full bg-primary"
				style={{ width: `${Math.max(1, v) * 0.6}px` }}
			/>
			<span className="font-mono text-[12.5px]">{v.toFixed(1)}</span>
		</div>
	);
}

/** Scoring column header with an optional info tooltip. */
export function ColHead({
	label,
	className,
}: {
	label: string;
	className?: string;
}) {
	return (
		<TableHead className={className}>
			<span className="inline-flex items-center">
				{label}
				{HELP[label] && <InfoTip text={HELP[label]} />}
			</span>
		</TableHead>
	);
}

const PRESETS: { label: string; w: Weights }[] = [
	{ label: "Default", w: DEFAULT_WEIGHTS },
	{
		label: "Report",
		w: {
			prdAdherence: 0.5,
			codeQuality: 0.35,
			speed: 0.075,
			tokenSpend: 0.075,
		},
	},
	{
		label: "Quality only",
		w: { prdAdherence: 0, codeQuality: 1, speed: 0, tokenSpend: 0 },
	},
];

const sameWeights = (a: Weights, b: Weights) =>
	DIM_KEYS.every((k) => Math.abs(a[k] - b[k]) < 0.001);

/** Composite weights panel. Re-weighting recomputes from stored dimension scores
 *  through the same scoring module the CLI uses; nothing re-runs. */
export function WeightControls({
	weights,
	onChange,
	className,
	inline = false,
}: {
	weights: Weights;
	onChange: (w: Weights) => void;
	className?: string;
	/** Compact strip for the foot of a table card instead of a side card. */
	inline?: boolean;
}) {
	const set = (k: keyof Weights, v: number) => {
		const next = { ...weights, [k]: v };
		const sum =
			next.prdAdherence + next.codeQuality + next.speed + next.tokenSpend || 1;
		onChange({
			prdAdherence: next.prdAdherence / sum,
			codeQuality: next.codeQuality / sum,
			speed: next.speed / sum,
			tokenSpend: next.tokenSpend / sum,
		});
	};
	const presets = (
		<div className="flex flex-wrap gap-1.5">
			{PRESETS.map((p) => {
				const on = sameWeights(weights, p.w);
				return (
					<button
						key={p.label}
						type="button"
						aria-pressed={on}
						onClick={() => onChange(p.w)}
						className={cn(
							"h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
							on
								? "border-foreground bg-foreground text-background"
								: "border-border text-muted-foreground hover:text-foreground",
						)}
					>
						{p.label}
					</button>
				);
			})}
		</div>
	);
	if (inline)
		return (
			<div
				className={cn(
					"grid gap-x-8 gap-y-4 border-t border-border bg-muted/40 px-5 py-4 lg:grid-cols-[auto_1fr]",
					className,
				)}
			>
				<div className="grid content-start gap-2">
					<span className="text-[13px] font-medium">Weights</span>
					{presets}
				</div>
				<div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
					{DIM_KEYS.map((k) => (
						<label key={k} className="grid gap-2" htmlFor={`wi-${k}`}>
							<span className="flex items-center justify-between text-[12.5px]">
								<span className="text-muted-foreground">{DIM_LABELS[k]}</span>
								<span className="font-mono">
									{(weights[k] * 100).toFixed(1)}%
								</span>
							</span>
							<Slider
								id={`wi-${k}`}
								min={0}
								max={100}
								step={1}
								value={[weights[k] * 100]}
								onValueChange={([v]) => set(k, (v ?? 0) / 100)}
							/>
						</label>
					))}
				</div>
			</div>
		);
	return (
		<Card className={cn("flex flex-col gap-4 p-5", className)}>
			<div>
				<h2 className="m-0 text-[14px] font-semibold">Weights</h2>
				<p className="mt-0.5 text-[12.5px] text-muted-foreground">
					Recomputed from stored scores. Nothing re-runs.
				</p>
			</div>
			{presets}
			<div className="flex flex-col gap-4">
				{DIM_KEYS.map((k) => (
					<label key={k} className="grid gap-2" htmlFor={`w-${k}`}>
						<span className="flex items-center justify-between text-[13px]">
							<span className="inline-flex items-center">
								{DIM_LABELS[k]}
								{HELP[DIM_LABELS[k]] && (
									<InfoTip text={HELP[DIM_LABELS[k]] ?? ""} />
								)}
							</span>
							<span className="font-mono text-[12.5px] text-muted-foreground">
								{(weights[k] * 100).toFixed(1)}%
							</span>
						</span>
						<Slider
							id={`w-${k}`}
							min={0}
							max={100}
							step={1}
							value={[weights[k] * 100]}
							onValueChange={([v]) => set(k, (v ?? 0) / 100)}
						/>
					</label>
				))}
			</div>
			<p className="m-0 border-t border-border pt-3 text-[12px] text-muted-foreground">
				* Speed and token spend are normalized within each run, so they do not
				compare across runs.
			</p>
		</Card>
	);
}

/** Composite chart: one row per entrant, a dot at the score and a band over its
 *  min–max range across trials/runs. */
export function CompositeChart({
	rows,
}: {
	rows: {
		key: string;
		label: ReactNode;
		value: number;
		min: number;
		max: number;
	}[];
}) {
	return (
		<div className="grid gap-1">
			{rows.map((r) => (
				<div
					key={r.key}
					className="grid grid-cols-[minmax(110px,170px)_1fr_52px] items-center gap-4"
				>
					<span className="truncate text-[13.5px] font-medium">{r.label}</span>
					<div className="relative h-9 bg-[linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[length:25%_100%]">
						<span
							className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/25"
							style={{
								left: `${Math.max(0, r.min)}%`,
								width: `${Math.max(0.8, r.max - r.min)}%`,
							}}
						/>
						<span
							className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-[3px] ring-card"
							style={{ left: `${r.value}%` }}
						/>
					</div>
					<span className="text-right font-mono text-[13.5px] font-medium">
						{r.value.toFixed(1)}
					</span>
				</div>
			))}
			<div className="grid grid-cols-[minmax(110px,170px)_1fr_52px] gap-4 font-mono text-[11px] text-muted-foreground">
				<span />
				<span className="flex justify-between">
					<span>0</span>
					<span>25</span>
					<span>50</span>
					<span>75</span>
					<span>100</span>
				</span>
				<span />
			</div>
		</div>
	);
}

/** Pass / partial / fail mark for a graded plan step (shape + colour, never
 *  colour alone). */
export function OutcomeIcon({ o }: { o: "pass" | "partial" | "fail" }) {
	if (o === "pass")
		return (
			<Check aria-label="pass" className="size-3.5 shrink-0 text-success" />
		);
	if (o === "fail")
		return <X aria-label="fail" className="size-3.5 shrink-0 text-danger" />;
	return (
		<svg
			role="img"
			aria-label="partial"
			viewBox="0 0 14 14"
			className="size-3.5 shrink-0 text-warn"
		>
			<circle
				cx="7"
				cy="7"
				r="5.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
			/>
			<path d="M7 1.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
		</svg>
	);
}

/** Collapsible evidence/justification block (native details, themed). */
export function Evidence({ text }: { text: string }) {
	return (
		<details className="group">
			<summary className="flex cursor-pointer list-none items-start gap-1.5 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
				<ChevronRight
					aria-hidden="true"
					className="mt-[3px] size-3.5 shrink-0 transition-transform group-open:rotate-90"
				/>
				<span>
					{text.slice(0, 90)}
					{text.length > 90 ? "…" : ""}
				</span>
			</summary>
			<pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2.5 font-mono text-[12px] text-foreground">
				{text}
			</pre>
		</details>
	);
}
