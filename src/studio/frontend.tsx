import {
	ChartNoAxesColumn,
	ChevronRight,
	History,
	Monitor,
	Moon,
	Network,
	Plus,
	Sun,
	TrendingUp,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Logo } from "./components/Logo";
import { TooltipProvider } from "./components/ui/tooltip";
import { cn } from "./lib/utils";
import { BracketView } from "./views/BracketView";
import { Configure } from "./views/Configure";
import { InverseScaling } from "./views/InverseScaling";
import { Leaderboard } from "./views/Leaderboard";
import { Runs } from "./views/Runs";
import { RunView } from "./views/RunView";
import { TrialView } from "./views/TrialView";
import "./index.css";

/** The project name shown in the nav wordmark and used as the document-title
 *  prefix, so browser tabs / bookmarks read "CodingHarness — <page>". */
const BRAND = "CodingHarness";

/** Map the current path to a human page name for the document title. Mirrors the
 *  routing in Routed() + Sidebar(). */
function pageTitle(path: string): string {
	if (path === "/configure") return "New Run";
	if (path === "/inverse-scaling") return "Trends";
	if (path === "/bracket") return "Tournament";
	if (path === "/runs") return "Runs";
	const trial = path.match(/^\/runs\/([^/]+)\/trials\/([^/]+)$/);
	if (trial?.[2]) return `Trial ${trial[2]}`;
	const run = path.match(/^\/runs\/([^/]+)$/);
	if (run?.[1]) return `Run ${run[1]}`;
	return "Leaderboard";
}

/** Path-based routing: / → leaderboard, /configure → configure, /runs → queue,
 *  /runs/:id → run trace, /runs/:id/trials/:trialId → trial. */
function Routed() {
	const path = window.location.pathname;
	if (path === "/configure") return <Configure />;
	if (path === "/inverse-scaling") return <InverseScaling />;
	if (path === "/bracket") return <BracketView />;
	if (path === "/runs") return <Runs />;
	const trial = path.match(/^\/runs\/([^/]+)\/trials\/([^/]+)$/);
	if (trial?.[1] && trial[2])
		return <TrialView runId={trial[1]} trialId={trial[2]} />;
	const run = path.match(/^\/runs\/([^/]+)$/);
	if (run?.[1]) return <RunView runId={run[1]} />;
	return <Leaderboard />;
}

// studio-theming: light/dark/system, persisted to localStorage. The class is
// applied pre-paint by the inline script in index.html; this keeps it in sync as
// the user toggles and tracks the OS when in system mode.
type Theme = "light" | "dark" | "system";

function resolveDark(t: Theme): boolean {
	return (
		t === "dark" ||
		(t === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches)
	);
}
function applyTheme(t: Theme): void {
	document.documentElement.classList.toggle("dark", resolveDark(t));
}
function storedTheme(): Theme {
	try {
		const v = localStorage.getItem("studio-theme");
		return v === "light" || v === "dark" || v === "system" ? v : "system";
	} catch {
		return "system";
	}
}

function ThemeSwitch() {
	const [theme, setTheme] = useState<Theme>(storedTheme);
	useEffect(() => {
		applyTheme(theme);
		try {
			localStorage.setItem("studio-theme", theme);
		} catch {}
		if (theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);
	const opts: [Theme, ReactNode][] = [
		["light", <Sun key="l" className="size-3.5" />],
		["dark", <Moon key="d" className="size-3.5" />],
		["system", <Monitor key="s" className="size-3.5" />],
	];
	return (
		<fieldset
			aria-label="Theme"
			className="m-0 min-w-0 inline-flex rounded-md border border-border bg-background p-0.5"
		>
			{opts.map(([t, icon]) => (
				<button
					key={t}
					type="button"
					aria-pressed={theme === t}
					aria-label={`${t} theme`}
					title={`${t[0]?.toUpperCase()}${t.slice(1)} theme`}
					onClick={() => setTheme(t)}
					className={cn(
						"grid h-6 w-7 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground",
						theme === t && "bg-secondary text-foreground",
					)}
				>
					{icon}
				</button>
			))}
		</fieldset>
	);
}

interface QueueEntry {
	runId: string;
	kind: "dry" | "live";
	status: string;
	stage?: string | null;
	candidates: string[];
	trials: Record<string, string>;
	costUsdSoFar: number;
}

/** Polls the studio queue so every page shows what is running and what it has
 *  spent (spend is never a surprise). */
function useLiveRuns(): QueueEntry[] {
	const [q, setQ] = useState<QueueEntry[]>([]);
	useEffect(() => {
		let live = true;
		const tick = () =>
			fetch("/api/queue")
				.then((r) => r.json())
				.then((d: QueueEntry[]) => live && setQ(d))
				.catch(() => {});
		tick();
		const id = setInterval(tick, 4000);
		return () => {
			live = false;
			clearInterval(id);
		};
	}, []);
	return q.filter((j) => j.status === "running" || j.status === "queued");
}

function LiveRunCard({ job }: { job: QueueEntry }) {
	const trials = Object.values(job.trials);
	const done = trials.filter((s) => s !== "running" && s !== "pending").length;
	const total = trials.length || job.candidates.length;
	return (
		<a
			href={`/runs/${job.runId}`}
			className="block rounded-lg border border-border bg-card p-3 text-[12.5px] no-underline transition-colors hover:border-input"
		>
			<span className="flex items-center gap-2 font-medium text-foreground">
				<span className="relative flex size-2">
					<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
					<span className="relative inline-flex size-2 rounded-full bg-primary" />
				</span>
				{job.kind === "dry" ? "Dry run" : "Run"} in progress
			</span>
			<span className="mt-1 block truncate text-muted-foreground">
				{job.stage ?? `${job.candidates.length} frameworks`}
			</span>
			<span className="mt-2 flex items-baseline justify-between">
				<span className="font-mono text-foreground">
					${job.costUsdSoFar.toFixed(2)}
				</span>
				<span className="text-muted-foreground">
					{done}/{total} trials
				</span>
			</span>
			<span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-secondary">
				<span
					className="block h-full rounded-full bg-primary transition-[width]"
					style={{ width: `${total ? (done / total) * 100 : 0}%` }}
				/>
			</span>
		</a>
	);
}

const NAV: { href: string; label: string; icon: ReactNode; group?: string }[] =
	[
		{
			href: "/",
			label: "Leaderboard",
			icon: <ChartNoAxesColumn className="size-4" />,
		},
		{ href: "/runs", label: "Runs", icon: <History className="size-4" /> },
		{ href: "/configure", label: "New run", icon: <Plus className="size-4" /> },
		{
			href: "/inverse-scaling",
			label: "Trends",
			icon: <TrendingUp className="size-4" />,
			group: "Analysis",
		},
		{
			href: "/bracket",
			label: "Tournament",
			icon: <Network className="size-4" />,
			group: "Analysis",
		},
	];

function isActive(href: string, path: string): boolean {
	if (href === "/") return path === "/";
	if (href === "/runs") return path === "/runs" || path.startsWith("/runs/");
	return path === href;
}

function Sidebar() {
	const path = window.location.pathname;
	const live = useLiveRuns();
	let lastGroup: string | undefined;
	return (
		<aside className="flex flex-col gap-4 border-b border-border bg-sidebar px-3 py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-[232px] lg:shrink-0 lg:border-b-0 lg:border-r lg:py-4">
			<div className="flex items-center justify-between px-2">
				<Logo />
				<div className="lg:hidden">
					<ThemeSwitch />
				</div>
			</div>
			<nav
				aria-label="Primary"
				className="-mx-1 flex gap-0.5 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
			>
				{NAV.map((n) => {
					const header =
						n.group && n.group !== lastGroup ? (
							<span className="hidden px-2.5 pt-4 pb-1 text-[11.5px] font-medium text-muted-foreground lg:block">
								{n.group}
							</span>
						) : null;
					lastGroup = n.group;
					const active = isActive(n.href, path);
					return (
						<span key={n.href} className="contents">
							{header}
							<a
								href={n.href}
								aria-current={active ? "page" : undefined}
								className={cn(
									"flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium text-muted-foreground no-underline transition-colors hover:bg-secondary hover:text-foreground",
									active &&
										"bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-border hover:bg-card",
								)}
							>
								<span className={active ? "text-foreground" : ""}>
									{n.icon}
								</span>
								{n.label}
							</a>
						</span>
					);
				})}
			</nav>
			<div className="mt-auto hidden flex-col gap-3 lg:flex">
				{live[0] && <LiveRunCard job={live[0]} />}
				{live.length > 1 && (
					<a
						href="/runs"
						className="inline-flex items-center gap-0.5 px-1 text-[12px] text-muted-foreground no-underline hover:text-foreground"
					>
						+{live.length - 1} more running
						<ChevronRight aria-hidden="true" className="size-3.5" />
					</a>
				)}
				<div className="flex items-center justify-between px-1">
					<span className="text-[12px] text-muted-foreground">Theme</span>
					<ThemeSwitch />
				</div>
			</div>
			{live.length > 0 && (
				<div className="lg:hidden">
					<LiveRunCard job={live[0] as QueueEntry} />
				</div>
			)}
		</aside>
	);
}

function App() {
	// Tab/bookmark title tracks the project name + current page. Routing is
	// full-page, so setting it once on mount is sufficient.
	useEffect(() => {
		document.title = `${BRAND} — ${pageTitle(window.location.pathname)}`;
	}, []);
	return (
		<TooltipProvider delayDuration={150}>
			<div className="flex min-h-dvh flex-col lg:flex-row">
				<Sidebar />
				<main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
					<div className="mx-auto w-full max-w-[1280px]">
						<Routed />
					</div>
				</main>
			</div>
		</TooltipProvider>
	);
}

const el = document.getElementById("root");
if (el) {
	// Reuse the root across HMR re-evaluations; calling createRoot twice on the
	// same container warns and double-mounts.
	const g = globalThis as { __studioRoot?: ReturnType<typeof createRoot> };
	const root = g.__studioRoot ?? (g.__studioRoot = createRoot(el));
	root.render(<App />);
}
