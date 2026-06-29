/**
 * Bracket-bakeoff view (bracket-bakeoff): a single-elimination tournament drawn
 * as one lightweight SVG — vector boxes + elbow connectors, no images. Each match
 * shows both entrants' goal scorelines (the FIFA layer) AND their absolute
 * adherence, so the scoreline isn't mistaken for the rubric. Retrospective v1:
 * matches are played from existing graded trials.
 */
import { useState } from "react";
import { Badge } from "../components/ui/badge";
import { useFetch } from "../lib/api";

type Metric = "goals" | "quality";
interface Breakdown {
	passes: number;
	fails: number;
	partials: number;
	partialCredit: number;
	total: number;
}
interface Entrant {
	candidate: string;
	seed: number;
	score: number; // the metric's value (goals or quality)
	adherence: number;
	quality: number;
	goals: number;
	breakdown: Breakdown;
}
interface BMatch {
	round: number;
	a: string | null;
	b: string | null;
	winner: string | null;
	reason: string | null;
	bye: boolean;
}
interface Bracket {
	target: string;
	harness: string;
	model: string;
	metric: Metric;
	entrants: Entrant[];
	rounds: BMatch[][];
	champion: string | null;
}

/** Hover explanation of a score. */
function scoreTitle(metric: Metric, e: Entrant): string {
	if (metric === "quality")
		return `Code quality ${e.quality.toFixed(1)} — blind judge median across criteria (×10); adherence ${e.adherence.toFixed(0)}`;
	const b = e.breakdown;
	const partial =
		b.partials > 0
			? `, ${b.partials} partial (+${b.partialCredit.toFixed(1)})`
			: "";
	return `Goals ${b.total.toFixed(1)} = ${b.passes} pass (+${b.passes}), ${b.fails} fail (−${b.fails})${partial} · bonus steps excluded · adherence ${e.adherence.toFixed(0)}`;
}

const BOX_W = 252;
const ROW_H = 26;
const BOX_H = ROW_H * 2;
const H_GAP = 72;
const V_GAP = 20;
const SLOT = BOX_H + V_GAP;
const colX = (r: number) => r * (BOX_W + H_GAP);

/** A soccer ball: white sphere + the iconic black centre pentagon and the five
 *  seams radiating to the rim. Reads clearly at this size; black/white so it's a
 *  ball in either theme. */
function GoalBall({ x, y }: { x: number; y: number }) {
	const pent = "0,-2.7 2.6,-0.8 1.6,2.2 -1.6,2.2 -2.6,-0.8";
	const seams = [
		"M0,-2.7 L0,-6.6",
		"M2.6,-0.8 L6.3,-2.0",
		"M1.6,2.2 L3.9,5.4",
		"M-1.6,2.2 L-3.9,5.4",
		"M-2.6,-0.8 L-6.3,-2.0",
	];
	return (
		<g transform={`translate(${x} ${y})`} aria-hidden>
			<circle
				r="7"
				fill="#ffffff"
				stroke="var(--muted-foreground)"
				strokeWidth="0.9"
			/>
			{seams.map((d) => (
				<path key={d} d={d} stroke="#1f2328" strokeWidth="0.8" fill="none" />
			))}
			<polygon points={pent} fill="#1f2328" />
		</g>
	);
}

/** A code-quality mark: a small brace-pair glyph for the quality metric. */
function QualityMark({ x, y }: { x: number; y: number }) {
	return (
		<g
			transform={`translate(${x} ${y})`}
			stroke="var(--primary)"
			strokeWidth="1.3"
			fill="none"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			<path d="M-1.5 -5 Q-4 -5 -4 -2 Q-4 0 -6 0 Q-4 0 -4 2 Q-4 5 -1.5 5" />
			<path d="M1.5 -5 Q4 -5 4 -2 Q4 0 6 0 Q4 0 4 2 Q4 5 1.5 5" />
		</g>
	);
}

function Row({
	x,
	y,
	name,
	ent,
	isWinner,
	metric,
}: {
	x: number;
	y: number;
	name: string | null;
	ent?: Entrant;
	isWinner: boolean;
	metric: Metric;
}) {
	if (!name)
		return (
			<text
				x={x + 10}
				y={y + ROW_H / 2 + 4}
				className="fill-muted-foreground text-[12px]"
			>
				—
			</text>
		);
	return (
		<g>
			{isWinner && (
				<rect
					x={x + 1}
					y={y + 1}
					width={BOX_W - 2}
					height={ROW_H - 2}
					rx="3"
					fill="var(--primary)"
					opacity="0.16"
				/>
			)}
			<text
				x={x + 10}
				y={y + ROW_H / 2 + 4}
				className={`text-[12px] ${isWinner ? "fill-foreground font-semibold" : "fill-muted-foreground"}`}
			>
				{name}
			</text>
			{ent && (
				<>
					{metric === "goals" ? (
						<GoalBall x={x + BOX_W - 88} y={y + ROW_H / 2} />
					) : (
						<QualityMark x={x + BOX_W - 88} y={y + ROW_H / 2} />
					)}
					<text
						x={x + BOX_W - 48}
						y={y + ROW_H / 2 + 4}
						textAnchor="end"
						className="cursor-help fill-foreground font-mono text-[12px] font-semibold"
					>
						{ent.score.toFixed(1)}
						<title>{scoreTitle(metric, ent)}</title>
					</text>
					<text
						x={x + BOX_W - 9}
						y={y + ROW_H / 2 + 4}
						textAnchor="end"
						className="fill-muted-foreground font-mono text-[10px]"
					>
						{ent.adherence.toFixed(0)}a
					</text>
				</>
			)}
		</g>
	);
}

function BracketSvg({ bracket }: { bracket: Bracket }) {
	const { rounds, entrants } = bracket;
	const ent = new Map(entrants.map((e) => [e.candidate, e]));
	// y-centre of each match
	const ys: number[][] = [];
	rounds.forEach((matches, r) => {
		ys[r] = matches.map((_, i) =>
			r === 0
				? i * SLOT + BOX_H / 2
				: ((ys[r - 1]?.[2 * i] ?? 0) + (ys[r - 1]?.[2 * i + 1] ?? 0)) / 2,
		);
	});
	const champCol = rounds.length;
	const totalW = colX(champCol) + BOX_W + 20;
	const totalH = Math.max(rounds[0]?.length ?? 1, 1) * SLOT;
	const champY = ys[rounds.length - 1]?.[0] ?? BOX_H / 2;

	return (
		<svg
			viewBox={`-4 -4 ${totalW + 8} ${totalH + 8}`}
			style={{ width: totalW, maxWidth: "100%", height: "auto" }}
			role="img"
			aria-label={`${bracket.target} bracket`}
		>
			{/* connectors: each match → its parent in the next round */}
			{rounds.slice(0, -1).map((matches, r) =>
				matches.map((m, i) => {
					const x1 = colX(r) + BOX_W;
					const y1 = ys[r]?.[i] ?? 0;
					const x2 = colX(r + 1);
					const y2 = ys[r + 1]?.[Math.floor(i / 2)] ?? 0;
					const midX = (x1 + x2) / 2;
					return (
						<path
							key={`c-${m.round}-${m.a}-${m.b}`}
							d={`M${x1} ${y1} H${midX} V${y2} H${x2}`}
							fill="none"
							stroke="var(--border)"
							strokeWidth="1.5"
						/>
					);
				}),
			)}
			{/* connector from final → champion */}
			<path
				d={`M${colX(rounds.length - 1) + BOX_W} ${champY} H${colX(champCol)}`}
				fill="none"
				stroke="var(--border)"
				strokeWidth="1.5"
			/>
			{/* match boxes */}
			{rounds.map((matches, r) =>
				matches.map((m, i) => {
					const x = colX(r);
					const y = (ys[r]?.[i] ?? 0) - BOX_H / 2;
					return (
						<g key={`m-${m.round}-${m.a}-${m.b}`}>
							<rect
								x={x}
								y={y}
								width={BOX_W}
								height={BOX_H}
								rx="6"
								fill="var(--card)"
								stroke="var(--border)"
								strokeWidth="1"
							/>
							<line
								x1={x}
								y1={y + ROW_H}
								x2={x + BOX_W}
								y2={y + ROW_H}
								stroke="var(--border)"
								strokeWidth="1"
							/>
							<Row
								x={x}
								y={y}
								name={m.a}
								ent={m.a ? ent.get(m.a) : undefined}
								isWinner={m.winner === m.a && !!m.a}
								metric={bracket.metric}
							/>
							<Row
								x={x}
								y={y + ROW_H}
								name={m.b}
								ent={m.b ? ent.get(m.b) : undefined}
								isWinner={m.winner === m.b && !!m.b}
								metric={bracket.metric}
							/>
						</g>
					);
				}),
			)}
			{/* champion */}
			<g transform={`translate(${colX(champCol)} ${champY - ROW_H / 2})`}>
				<rect
					width={BOX_W}
					height={ROW_H}
					rx="6"
					fill="var(--primary)"
					opacity="0.16"
				/>
				<rect
					width={BOX_W}
					height={ROW_H}
					rx="6"
					fill="none"
					stroke="var(--primary)"
					strokeWidth="1.5"
				/>
				<text
					x={10}
					y={ROW_H / 2 + 4}
					className="fill-foreground text-[12px] font-bold"
				>
					🏆 {bracket.champion ?? "—"}
				</text>
			</g>
		</svg>
	);
}

const groupKey = (b: Bracket) => `${b.target}|${b.harness}|${b.model}`;

export function BracketView() {
	const data = useFetch<Bracket[]>("/api/bracket");
	const [group, setGroup] = useState<string | null>(null);
	const [metric, setMetric] = useState<Metric>("goals");
	if (!data) return <p className="text-muted-foreground">loading…</p>;
	if (!data.length)
		return (
			<>
				<h1 className="text-xl font-bold tracking-tight">🏆 Bracket bakeoff</h1>
				<p className="mt-2 text-[13px] text-muted-foreground">
					No bracketable target yet — a bracket needs ≥4 candidates graded on
					the same target, harness, and model.
				</p>
			</>
		);
	// unique groups in input order
	const groups = [...new Map(data.map((b) => [groupKey(b), b])).values()];
	const activeGroup = group ?? groupKey(groups[0] as Bracket);
	const b =
		data.find((x) => groupKey(x) === activeGroup && x.metric === metric) ??
		data.find((x) => groupKey(x) === activeGroup) ??
		data[0];
	if (!b) return null;
	const sat =
		metric === "goals" &&
		b.entrants.every((e) => e.adherence === b.entrants[0]?.adherence);

	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">🏆 Bracket bakeoff</h1>
			<p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
				Single-elimination tournament. Score by <strong>goals</strong> (each
				passed PRD step +1, fail −1, partial its credit) or by{" "}
				<strong>code quality</strong> (blind-judge points) — higher advances,
				ties broken by the other metric → efficiency → seed. Hover a scoreline
				for the breakdown; the <span className="font-mono">N.Na</span> is the
				absolute adherence. <span className="text-warn">Retrospective</span>:
				matches are played from existing graded trials.
			</p>

			<div className="mt-3 flex flex-wrap items-center gap-3">
				<div className="flex flex-wrap items-center gap-2">
					{groups.map((bb) => {
						const k = groupKey(bb);
						return (
							<button
								type="button"
								key={k}
								onClick={() => setGroup(k)}
								className={`rounded-md px-2.5 py-1 text-[13px] ${k === activeGroup ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
							>
								{bb.target}{" "}
								<span className="font-mono text-[11px] opacity-70">
									{bb.entrants.length}
								</span>
							</button>
						);
					})}
				</div>
				<div className="ml-auto flex items-center overflow-hidden rounded-md border border-border">
					{(["goals", "quality"] as Metric[]).map((m) => (
						<button
							type="button"
							key={m}
							onClick={() => setMetric(m)}
							className={`px-2.5 py-1 text-[13px] ${m === metric ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
						>
							{m === "goals" ? "Goals" : "Code quality"}
						</button>
					))}
				</div>
			</div>

			<p className="mt-2 text-[12px] text-muted-foreground">
				{b.harness} / {b.model} · {b.entrants.length} entrants · scored by{" "}
				<span className="font-semibold">
					{metric === "goals" ? "PRD-pass goals" : "code quality"}
				</span>{" "}
				· champion <span className="font-semibold">{b.champion}</span>
				{sat && (
					<Badge variant="warn" className="ml-2">
						goals/adherence saturated — try Code quality
					</Badge>
				)}
			</p>

			<div className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-4">
				<BracketSvg bracket={b} />
			</div>
		</>
	);
}
