/**
 * Brownfield task review (add-brownfield-track D15, tasks 2.2–2.4).
 *
 *   /review                 task list (LLM strata shown only for reviewed tasks)
 *   /review/:repo/:id       label one task — blind until submitted
 *   /review/agreement       human vs LLM agreement (Cohen's κ), disagreements
 *
 * Blindness is enforced by the server (`src/brownfield/review.ts` withholds all
 * classifier output until a review exists); this view just never asks for it.
 *
 * Keys on a task: j/k or ↓/↑ move between issue items · 1–5 set the leak level
 * (and advance) · y / n / u set test fairness · ⌘/Ctrl+Enter submits.
 */
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type {
	AgreementSummary,
	TaskDetail,
	TaskSummary,
} from "../../brownfield/review";
import { Badge } from "../components/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "../components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table";
import { Markdown } from "../lib/markdown";

const LEVELS = [
	"noise",
	"symptom",
	"diagnosis",
	"fix_sketch",
	"fix_code",
] as const;
type Level = (typeof LEVELS)[number];
type Fairness = "yes" | "no" | "unsure";
const VARIANTS = ["body", "body+human", "body+all"] as const;

const levelVariant = (l: Level | null | undefined) =>
	l === "fix_code" || l === "fix_sketch"
		? "danger"
		: l === "diagnosis"
			? "warn"
			: "default";

function LevelBadge({ level }: { level: Level | null | undefined }) {
	if (!level) return <span className="text-muted-foreground">—</span>;
	return (
		<Badge variant={levelVariant(level)} className="font-mono text-[11px]">
			{level}
		</Badge>
	);
}

function useJson<T>(
	url: string,
	deps: unknown[] = [],
): [T | null, string | null, () => void] {
	const [data, setData] = useState<T | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: caller-supplied deps
	useEffect(() => {
		fetch(url)
			.then(async (r) => {
				const j = await r.json();
				if (!r.ok) throw new Error(j.error ?? r.statusText);
				setData(j as T);
			})
			.catch((e) => setErr(String(e.message ?? e)));
	}, [url, tick, ...deps]);
	return [data, err, () => setTick((t) => t + 1)];
}

// ---------------------------------------------------------------- list

export function ReviewList() {
	const [tasks, err] = useJson<TaskSummary[]>("/api/brownfield/tasks");
	const [validOnly, setValidOnly] = useState(true);
	if (err) return <p className="text-danger">{err}</p>;
	if (!tasks) return <p className="text-muted-foreground">Loading tasks…</p>;
	const shown = tasks
		.filter((t) => !validOnly || t.verdict === "VALID")
		.sort((a, b) => a.pr - b.pr || a.id.localeCompare(b.id));
	const byRepo = new Map<string, TaskSummary[]>();
	for (const t of shown)
		byRepo.set(t.repo || t.repoDir, [
			...(byRepo.get(t.repo || t.repoDir) ?? []),
			t,
		]);
	const reviewed = shown.filter((t) => t.reviews > 0).length;
	const firstTodo = shown.find((t) => t.reviews === 0);
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-3">
				<h1 className="text-lg font-semibold">Brownfield task review</h1>
				<span className="text-sm text-muted-foreground">
					{reviewed} / {shown.length} reviewed
				</span>
				<label className="flex items-center gap-1.5 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={validOnly}
						onChange={(e) => setValidOnly(e.target.checked)}
					/>
					valid tasks only
				</label>
				{firstTodo && (
					<a
						className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground"
						href={`/review/${firstTodo.repoDir}/${firstTodo.id}`}
					>
						Next unreviewed →
					</a>
				)}
				<a
					className="ml-auto text-sm text-primary hover:underline"
					href="/review/agreement"
				>
					Agreement summary
				</a>
			</div>
			<p className="text-[13px] text-muted-foreground">
				Labeling is blind: the classifier's leak levels appear only after you
				submit a task.
			</p>
			{[...byRepo].map(([repo, list]) => (
				<Card key={repo}>
					<CardHeader className="pb-1">
						<CardTitle className="text-[14px]">
							{repo}{" "}
							<span className="font-normal text-muted-foreground">
								({list.filter((t) => t.reviews).length}/{list.length} reviewed)
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Task</TableHead>
									<TableHead>Verdict</TableHead>
									<TableHead>Items</TableHead>
									<TableHead>Reviews</TableHead>
									<TableHead>LLM body</TableHead>
									<TableHead>LLM comments</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{list.map((t) => (
									<TableRow key={t.id}>
										<TableCell>
											<a
												className="font-mono text-primary hover:underline"
												href={`/review/${t.repoDir}/${t.id}`}
											>
												#{t.pr} → #{t.issues.join(", #")}
											</a>
											{t.error && (
												<span className="ml-2 text-danger">{t.error}</span>
											)}
										</TableCell>
										<TableCell>
											<Badge variant={t.verdict === "VALID" ? "ok" : "default"}>
												{t.verdict}
											</Badge>
										</TableCell>
										<TableCell className="font-mono">{t.items}</TableCell>
										<TableCell className="font-mono">
											{t.reviews || "—"}
										</TableCell>
										<TableCell>
											{t.leak ? (
												<LevelBadge level={t.leak.body} />
											) : (
												<span className="text-muted-foreground">hidden</span>
											)}
										</TableCell>
										<TableCell>
											{t.leak ? (
												<LevelBadge level={t.leak.comments} />
											) : (
												<span className="text-muted-foreground">hidden</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// ---------------------------------------------------------------- diff

function Diff({ text }: { text: string }) {
	if (!text.trim()) return <p className="text-muted-foreground">(empty)</p>;
	return (
		<pre className="max-h-[70vh] overflow-auto rounded-sm bg-muted p-2 font-mono text-[12px] leading-[1.45]">
			{text.split("\n").map((line, i) => {
				const cls =
					line.startsWith("+++") || line.startsWith("---")
						? "text-muted-foreground"
						: line.startsWith("+")
							? "text-success"
							: line.startsWith("-")
								? "text-danger"
								: line.startsWith("@@")
									? "text-primary"
									: line.startsWith("diff ")
										? "font-semibold text-foreground"
										: "";
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: static diff lines
					<div key={i} className={cls}>
						{line || " "}
					</div>
				);
			})}
		</pre>
	);
}

// ---------------------------------------------------------------- task

interface Item {
	id: string;
	author: string;
	role: string;
	isBot: boolean;
	at: string | null;
	text: string;
}

function itemsOf(t: TaskDetail): Item[] {
	return [
		{
			id: "body",
			author: t.snapshot.issueAuthor,
			role: "issue author",
			isBot: false,
			at: null,
			text: t.snapshot.body,
		},
		...t.snapshot.comments.map((c, i) => ({
			id: `c${i + 1}`,
			author: c.author,
			role: c.role ?? (c.isBot ? "bot" : "other"),
			isBot: c.isBot,
			at: c.at,
			text: c.text,
		})),
	];
}

function Tabs<T extends string>({
	tabs,
	value,
	onChange,
}: {
	tabs: readonly { id: T; label: ReactNode }[];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div className="mb-2 flex gap-1 border-b border-border">
			{tabs.map((t) => (
				<button
					key={t.id}
					type="button"
					onClick={() => onChange(t.id)}
					className={`-mb-px border-b-2 px-2.5 py-1 text-[13px] ${value === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
				>
					{t.label}
				</button>
			))}
		</div>
	);
}

export function TaskReview({ repoDir, id }: { repoDir: string; id: string }) {
	const [task, err, reload] = useJson<TaskDetail>(
		`/api/brownfield/tasks/${repoDir}/${id}`,
	);
	const [labels, setLabels] = useState<Record<string, Level>>({});
	const [focus, setFocus] = useState(0);
	const [fairness, setFairness] = useState<Fairness | null>(null);
	const [note, setNote] = useState("");
	const [reviewer, setReviewer] = useState(
		() => localStorage.getItem("review-name") ?? "",
	);
	const [pane, setPane] = useState<"reference" | "tests" | "issue">(
		"reference",
	);
	const [variant, setVariant] = useState<(typeof VARIANTS)[number]>("body+all");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [next, setNext] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/brownfield/tasks")
			.then((r) => r.json())
			.then((all: TaskSummary[]) => {
				const todo = all.find(
					(t) =>
						t.verdict === "VALID" &&
						t.reviews === 0 &&
						!(t.repoDir === repoDir && t.id === id),
				);
				setNext(todo ? `/review/${todo.repoDir}/${todo.id}` : null);
			})
			.catch(() => {});
	}, [repoDir, id]);

	const items = task ? itemsOf(task) : [];
	const reviewed = !!task && task.reviews.length > 0;
	const complete =
		items.length > 0 &&
		items.every((it) => labels[it.id]) &&
		fairness !== null &&
		reviewer.trim() !== "";

	const submit = useCallback(async () => {
		if (!task || !complete || submitting) return;
		setSubmitting(true);
		setSubmitError(null);
		localStorage.setItem("review-name", reviewer.trim());
		const res = await fetch(`/api/brownfield/tasks/${repoDir}/${id}/labels`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				reviewer: reviewer.trim(),
				at: new Date().toISOString(),
				items: items.map((it) => ({ id: it.id, label: labels[it.id] })),
				fairness: { verdict: fairness, note },
			}),
		});
		const j = await res.json();
		setSubmitting(false);
		if (!res.ok) setSubmitError(j.error ?? "submit failed");
		else reload();
	}, [
		task,
		complete,
		submitting,
		reviewer,
		repoDir,
		id,
		items,
		labels,
		fairness,
		note,
		reload,
	]);

	useEffect(() => {
		if (reviewed) return;
		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") return void submit();
			if (e.key === "j" || e.key === "ArrowDown")
				setFocus((f) => Math.min(items.length - 1, f + 1));
			else if (e.key === "k" || e.key === "ArrowUp")
				setFocus((f) => Math.max(0, f - 1));
			else if (/^[1-5]$/.test(e.key)) {
				const it = items[focus];
				if (!it) return;
				setLabels((l) => ({
					...l,
					[it.id]: LEVELS[Number(e.key) - 1] as Level,
				}));
				setFocus((f) => Math.min(items.length - 1, f + 1));
			} else if (e.key === "y") setFairness("yes");
			else if (e.key === "n") setFairness("no");
			else if (e.key === "u") setFairness("unsure");
			else return;
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [reviewed, items, focus, submit]);

	useEffect(() => {
		document
			.getElementById(`item-${focus}`)
			?.scrollIntoView({ block: "nearest" });
	}, [focus]);

	if (err) return <p className="text-danger">{err}</p>;
	if (!task) return <p className="text-muted-foreground">Loading task…</p>;

	const latest = task.reviews.at(-1);
	const agreeBy = new Map((task.agreement ?? []).map((a) => [a.id, a]));
	const llmBy = new Map((task.llm?.items ?? []).map((i) => [i.id, i]));

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<a
					href="/review"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Tasks
				</a>
				<h1 className="font-mono text-base font-semibold">
					{task.repo} #{task.pr} → #{task.issues.join(", #")}
				</h1>
				<Badge variant={task.verdict === "VALID" ? "ok" : "default"}>
					{task.verdict}
				</Badge>
				{task.provisional && <Badge>provisional</Badge>}
				{task.depsTouched && <Badge variant="warn">deps-touched</Badge>}
				<span className="text-[12px] text-muted-foreground">
					T* {task.tStar.slice(0, 16).replace("T", " ")} ·{" "}
					{task.failToPass.length} fail→pass tests
				</span>
				{next && (
					<a
						href={next}
						className="ml-auto text-sm text-primary hover:underline"
					>
						Next unreviewed →
					</a>
				)}
			</div>
			<p className="text-[12px] text-muted-foreground">
				Label how much of the <strong>reference fix</strong> each text gives
				away: 1 noise · 2 symptom · 3 diagnosis · 4 fix_sketch · 5 fix_code.
				Wrong guesses are symptom. Keys: j/k move · 1–5 label · y/n/u fairness ·
				⌘/Ctrl+Enter submit.
			</p>

			<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
				{/* Issue items */}
				<div className="space-y-2">
					{items.map((it, i) => {
						const mine = reviewed
							? latest?.items.find((x) => x.id === it.id)?.label
							: labels[it.id];
						const a = agreeBy.get(it.id);
						const llm = llmBy.get(it.id);
						return (
							<Card
								key={it.id}
								id={`item-${i}`}
								onClick={() => setFocus(i)}
								className={
									!reviewed && focus === i ? "ring-2 ring-primary" : ""
								}
							>
								<CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-1">
									<span className="font-mono text-[12px] text-muted-foreground">
										{it.id}
									</span>
									<span className="text-[13px] font-medium">@{it.author}</span>
									{!it.isBot && <Badge>{it.role}</Badge>}
									{it.isBot && <Badge variant="warn">bot</Badge>}
									{it.at && (
										<span className="text-[12px] text-muted-foreground">
											{it.at.slice(0, 10)}
										</span>
									)}
									<span className="ml-auto flex items-center gap-1.5">
										{reviewed ? (
											<>
												<span className="text-[11px] text-muted-foreground">
													you
												</span>
												<LevelBadge level={mine as Level} />
												<span className="text-[11px] text-muted-foreground">
													LLM
												</span>
												<LevelBadge level={a?.llm as Level} />
												<span
													className={a?.agree ? "text-success" : "text-danger"}
												>
													{a?.agree ? "✓" : "✗"}
												</span>
											</>
										) : (
											LEVELS.map((l, k) => (
												<button
													key={l}
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														setLabels((x) => ({ ...x, [it.id]: l }));
													}}
													className={`rounded-sm border px-1.5 py-0.5 font-mono text-[11px] ${mine === l ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
													title={l}
												>
													{k + 1} {l}
												</button>
											))
										)}
									</span>
								</CardHeader>
								<CardContent className="max-h-[40vh] overflow-auto text-[13px]">
									<Markdown source={it.text.replace(/<!--[\s\S]*?-->/g, "")} />
									{reviewed && llm && (
										<div className="mt-2 rounded-sm border border-border p-2 text-[12px]">
											<div className="text-muted-foreground">
												LLM evidence
												{llm.consistent_with_reference
													? ""
													: " (inconsistent with reference)"}
												:
											</div>
											<pre className="whitespace-pre-wrap font-mono">
												{llm.evidence || "—"}
											</pre>
											<div className="mt-1 text-muted-foreground">
												{llm.rationale}
											</div>
										</div>
									)}
								</CardContent>
							</Card>
						);
					})}

					{/* Fairness + submit */}
					<Card>
						<CardContent className="space-y-2 pt-3">
							<div className="text-[13px]">
								<strong>Test fairness:</strong> do the hidden tests check only
								behavior the issue describes?
							</div>
							{reviewed ? (
								<div className="text-[13px]">
									<Badge>{latest?.fairness.verdict}</Badge>{" "}
									<span className="text-muted-foreground">
										{latest?.fairness.note}
									</span>
									<span className="ml-2 text-[12px] text-muted-foreground">
										— reviewed by {latest?.reviewer} ({task.reviews.length}{" "}
										review{task.reviews.length > 1 ? "s" : ""})
									</span>
								</div>
							) : (
								<>
									<div className="flex gap-1.5">
										{(["yes", "no", "unsure"] as const).map((f) => (
											<button
												key={f}
												type="button"
												onClick={() => setFairness(f)}
												className={`rounded-sm border px-2 py-0.5 text-[12px] ${fairness === f ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
											>
												{f[0]} · {f}
											</button>
										))}
									</div>
									<textarea
										value={note}
										onChange={(e) => setNote(e.target.value)}
										placeholder="Note (e.g. tests assert a function name the issue never mentions)"
										className="h-14 w-full rounded-sm border border-border bg-background p-1.5 text-[13px]"
									/>
									<div className="flex items-center gap-2">
										<input
											value={reviewer}
											onChange={(e) => setReviewer(e.target.value)}
											placeholder="Your name"
											className="w-40 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[13px]"
										/>
										<button
											type="button"
											disabled={!complete || submitting}
											onClick={submit}
											className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-40"
										>
											{submitting
												? "Submitting…"
												: "Submit & reveal LLM labels"}
										</button>
										<span className="text-[12px] text-muted-foreground">
											{items.filter((it) => labels[it.id]).length}/
											{items.length} labeled
										</span>
									</div>
									{submitError && (
										<p className="text-[13px] text-danger">{submitError}</p>
									)}
								</>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Evidence panes */}
				<div className="xl:sticky xl:top-2 xl:self-start">
					<Tabs
						tabs={[
							{ id: "reference", label: "Reference fix" },
							{ id: "tests", label: "Hidden tests" },
							{ id: "issue", label: "Issue as the worker sees it" },
						]}
						value={pane}
						onChange={setPane}
					/>
					{pane === "reference" && <Diff text={task.referencePatch} />}
					{pane === "tests" && (
						<>
							{task.failToPass.length > 0 && (
								<details className="mb-2 text-[12px]">
									<summary className="cursor-pointer text-muted-foreground">
										{task.failToPass.length} fail→pass test(s)
									</summary>
									<pre className="whitespace-pre-wrap font-mono">
										{task.failToPass.join("\n")}
									</pre>
								</details>
							)}
							<Diff text={task.testsPatch} />
						</>
					)}
					{pane === "issue" && (
						<>
							<Tabs
								tabs={VARIANTS.map((v) => ({ id: v, label: v }))}
								value={variant}
								onChange={setVariant}
							/>
							<div className="max-h-[70vh] overflow-auto rounded-sm border border-border p-3 text-[13px]">
								<Markdown source={task.variants[variant] ?? "(missing)"} />
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- agreement

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtK = (k: number | null) => (k == null ? "—" : k.toFixed(3));

export function AgreementView() {
	const [s, err] = useJson<AgreementSummary>("/api/brownfield/agreement");
	if (err) return <p className="text-danger">{err}</p>;
	if (!s) return <p className="text-muted-foreground">Loading…</p>;
	const a = s.leak;
	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<a
					href="/review"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Tasks
				</a>
				<h1 className="text-lg font-semibold">Human vs LLM leak labels</h1>
				<span className="text-sm text-muted-foreground">
					{s.reviewedTasks} of {s.totalTasks} tasks reviewed · {a.n} items
				</span>
			</div>
			{a.n === 0 ? (
				<p className="text-muted-foreground">
					No reviewed items yet. Review a task to see agreement.
				</p>
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
						{[
							["Exact agreement", pct(a.observed)],
							["Cohen's κ", fmtK(a.kappa)],
							["Weighted κ (quadratic)", fmtK(a.weightedKappa)],
							[
								"Fairness yes / no / unsure",
								`${s.fairness.yes} / ${s.fairness.no} / ${s.fairness.unsure}`,
							],
						].map(([k, v]) => (
							<Card key={k}>
								<CardContent className="pt-3">
									<div className="text-[12px] text-muted-foreground">{k}</div>
									<div className="font-mono text-lg">{v}</div>
								</CardContent>
							</Card>
						))}
					</div>
					<Card>
						<CardHeader className="pb-1">
							<CardTitle className="text-[14px]">
								Confusion (rows: you · columns: LLM)
							</CardTitle>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead />
										{LEVELS.map((l) => (
											<TableHead key={l} className="font-mono text-[11px]">
												{l}
											</TableHead>
										))}
										<TableHead>agree</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{LEVELS.map((h) => (
										<TableRow key={h}>
											<TableCell className="font-mono text-[12px]">
												{h}
											</TableCell>
											{LEVELS.map((l) => (
												<TableCell
													key={l}
													className={`font-mono ${h === l ? "font-semibold text-success" : ""}`}
												>
													{a.confusion[h][l] || ""}
												</TableCell>
											))}
											<TableCell className="font-mono text-[12px] text-muted-foreground">
												{a.perLevel[h].human
													? `${a.perLevel[h].agree}/${a.perLevel[h].human}`
													: "—"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-1">
							<CardTitle className="text-[14px]">
								Disagreements ({s.disagreements.length})
							</CardTitle>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Task</TableHead>
										<TableHead>Item</TableHead>
										<TableHead>You</TableHead>
										<TableHead>LLM</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{s.disagreements.map((d) => (
										<TableRow key={`${d.repoDir}/${d.id}/${d.item}`}>
											<TableCell>
												<a
													className="font-mono text-primary hover:underline"
													href={`/review/${d.repoDir}/${d.id}`}
												>
													{d.repoDir.replace("__", "/")} {d.id}
												</a>
											</TableCell>
											<TableCell className="font-mono">{d.item}</TableCell>
											<TableCell>
												<LevelBadge level={d.human} />
											</TableCell>
											<TableCell>
												<LevelBadge level={d.llm} />
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}
