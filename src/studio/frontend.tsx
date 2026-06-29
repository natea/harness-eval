import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Logo } from "./components/Logo";
import { TooltipProvider } from "./components/ui/tooltip";
import { Configure } from "./views/Configure";
import { InverseScaling } from "./views/InverseScaling";
import { Leaderboard } from "./views/Leaderboard";
import { Runs } from "./views/Runs";
import { RunView } from "./views/RunView";
import { TrialView } from "./views/TrialView";
import "./index.css";

/** Path-based routing: / → leaderboard, /configure → configure, /runs → queue,
 *  /runs/:id → scorecard, /runs/:id/trials/:trialId → trial. */
function Routed() {
	const path = window.location.pathname;
	if (path === "/configure") return <Configure />;
	if (path === "/inverse-scaling") return <InverseScaling />;
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
	const v = localStorage.getItem("studio-theme");
	return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>(storedTheme);
	useEffect(() => {
		applyTheme(theme);
		localStorage.setItem("studio-theme", theme);
		if (theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);
	const next: Theme =
		theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
	const icon = theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "🖥️";
	return (
		<button
			type="button"
			onClick={() => setTheme(next)}
			title={`Theme: ${theme} — click for ${next}`}
			aria-label={`Theme: ${theme}, switch to ${next}`}
			className="ml-auto rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
		>
			{icon} <span className="text-[12px]">{theme}</span>
		</button>
	);
}

function Nav() {
	const path = window.location.pathname;
	const tab = (href: string, label: string, active: boolean) => (
		<a
			href={href}
			className={`rounded-md px-2.5 py-1 text-sm ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
		>
			{label}
		</a>
	);
	return (
		<nav className="mb-4 flex items-center gap-1 border-b border-border pb-2">
			<Logo />
			{tab("/", "Review", path === "/")}
			{tab("/configure", "Configure", path === "/configure")}
			{tab("/inverse-scaling", "Inverse-scaling", path === "/inverse-scaling")}
			{tab("/runs", "Runs", path === "/runs")}
			<ThemeToggle />
		</nav>
	);
}

function App() {
	return (
		<TooltipProvider delayDuration={150}>
			<main className="w-full px-6 py-6">
				<Nav />
				<Routed />
			</main>
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
