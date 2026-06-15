import type { Weights } from "../../types";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Slider } from "../components/ui/slider";
import { TableHead } from "../components/ui/table";
import { InfoTip } from "../components/ui/tooltip";
import { DEFAULT_WEIGHTS, DIM_LABELS, HELP } from "../lib/api";

export const DIM_KEYS = Object.keys(DIM_LABELS) as (keyof Weights)[];

/** Horizontal data bar + monospace value (the accent's only decorative use). */
export function Bar({ v }: { v: number }) {
	return (
		<div className="flex items-center gap-2">
			<span
				className="inline-block h-[9px] rounded-[2px] bg-primary"
				style={{ width: `${Math.max(1, v) * 0.6}px` }}
			/>
			<span className="font-mono text-[12px]">{v.toFixed(1)}</span>
		</div>
	);
}

/** Scoring column header with an optional info tooltip. */
export function ColHead({ label }: { label: string }) {
	return (
		<TableHead>
			<span className="inline-flex items-center">
				{label}
				{HELP[label] && <InfoTip text={HELP[label]} />}
			</span>
		</TableHead>
	);
}

export function WeightControls({
	weights,
	onChange,
}: {
	weights: Weights;
	onChange: (w: Weights) => void;
}) {
	const set = (k: keyof Weights, v: number) => {
		const next = { ...weights, [k]: v };
		const sum =
			next.prdAdherence + next.codeQuality + next.speed + next.tokenSpend;
		onChange({
			prdAdherence: next.prdAdherence / sum,
			codeQuality: next.codeQuality / sum,
			speed: next.speed / sum,
			tokenSpend: next.tokenSpend / sum,
		});
	};
	return (
		<Card className="my-3">
			<CardHeader className="flex flex-row items-center justify-between pb-1">
				<CardTitle className="text-[13px]">
					Re-weight{" "}
					<span className="font-normal text-muted-foreground">
						(ephemeral, client-side)
					</span>
				</CardTitle>
				<button
					type="button"
					onClick={() => onChange(DEFAULT_WEIGHTS)}
					className="rounded-sm border border-border px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-muted"
				>
					reset
				</button>
			</CardHeader>
			<CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 pt-1 sm:grid-cols-2 lg:grid-cols-4">
				{DIM_KEYS.map((k) => (
					<div key={k} className="flex items-center gap-3">
						<span className="w-28 shrink-0 text-[13px]">{DIM_LABELS[k]}</span>
						<Slider
							className="min-w-0 flex-1 max-w-[200px]"
							min={0}
							max={100}
							step={1}
							value={[weights[k] * 100]}
							onValueChange={([v]) => set(k, (v ?? 0) / 100)}
						/>
						<span className="w-12 shrink-0 text-right font-mono text-[12px]">
							{(weights[k] * 100).toFixed(1)}%
						</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

/** Collapsible evidence/justification block (native details, themed). */
export function Evidence({ text }: { text: string }) {
	return (
		<details className="group">
			<summary className="cursor-pointer text-muted-foreground marker:text-muted-foreground">
				{text.slice(0, 90)}
				{text.length > 90 ? "…" : ""}
			</summary>
			<pre className="mt-1 whitespace-pre-wrap rounded-sm bg-muted p-2 font-mono text-[12px] text-foreground">
				{text}
			</pre>
		</details>
	);
}
