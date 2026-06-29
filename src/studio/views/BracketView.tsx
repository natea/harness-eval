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

interface Entrant {
	candidate: string;
	seed: number;
	adherence: number;
	quality: number;
	goals: number;
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
	entrants: Entrant[];
	rounds: BMatch[][];
	champion: string | null;
}

const BOX_W = 210;
const ROW_H = 26;
const BOX_H = ROW_H * 2;
const H_GAP = 72;
const V_GAP = 20;
const SLOT = BOX_H + V_GAP;
const colX = (r: number) => r * (BOX_W + H_GAP);

/** A soccer-ball goal glyph as inline SVG (cheap, vector). */
function GoalBall({ x, y }: { x: number; y: number }) {
	return (
		<g transform={`translate(${x} ${y})`}>
			<circle r="6" fill="var(--foreground)" opacity="0.12" />
			<circle
				r="6"
				fill="none"
				stroke="var(--muted-foreground)"
				strokeWidth="0.8"
			/>
			<path
				d="M0 -3.2 2.8 -1 1.8 2.6 -1.8 2.6 -2.8 -1 Z"
				fill="var(--muted-foreground)"
			/>
		</g>
	);
}

function Row({
	x,
	y,
	name,
	ent,
	isWinner,
}: {
	x: number;
	y: number;
	name: string | null;
	ent?: Entrant;
	isWinner: boolean;
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
					<GoalBall x={x + BOX_W - 58} y={y + ROW_H / 2} />
					<text
						x={x + BOX_W - 48}
						y={y + ROW_H / 2 + 4}
						className="fill-foreground font-mono text-[12px] font-semibold"
					>
						{ent.goals.toFixed(1)}
					</text>
					<text
						x={x + BOX_W - 10}
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
							/>
							<Row
								x={x}
								y={y + ROW_H}
								name={m.b}
								ent={m.b ? ent.get(m.b) : undefined}
								isWinner={m.winner === m.b && !!m.b}
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

export function BracketView() {
	const data = useFetch<Bracket[]>("/api/bracket");
	const [sel, setSel] = useState(0);
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
	const b = data[Math.min(sel, data.length - 1)] ?? data[0];
	if (!b) return null;

	return (
		<>
			<h1 className="text-xl font-bold tracking-tight">🏆 Bracket bakeoff</h1>
			<p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
				Single-elimination tournament. Each PRD step that passes is a goal (+1),
				a fail −1, a partial its credit; higher score advances, ties broken by
				code quality → efficiency → seed. The{" "}
				<span className="font-mono">N.Na</span> after each scoreline is the
				absolute adherence — the rubric score, not the goals.{" "}
				<span className="text-warn">Retrospective</span>: matches are played
				from existing graded trials (live head-to-head runs are the follow-on).
			</p>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				{data.map((bb, i) => (
					<button
						type="button"
						key={`${bb.target}|${bb.harness}|${bb.model}`}
						onClick={() => setSel(i)}
						className={`rounded-md px-2.5 py-1 text-[13px] ${i === sel ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
					>
						{bb.target}{" "}
						<span className="font-mono text-[11px] opacity-70">
							{bb.entrants.length}
						</span>
					</button>
				))}
			</div>

			<p className="mt-2 text-[12px] text-muted-foreground">
				{b.harness} / {b.model} · {b.entrants.length} entrants · seeded by
				adherence · champion <span className="font-semibold">{b.champion}</span>
				{b.entrants.every((e) => e.adherence === b.entrants[0]?.adherence) && (
					<Badge variant="warn" className="ml-2">
						adherence tied — decided on quality/efficiency
					</Badge>
				)}
			</p>

			<div className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-4">
				<BracketSvg bracket={b} />
			</div>
		</>
	);
}
