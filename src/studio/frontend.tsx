import { createRoot } from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip";
import { Configure } from "./views/Configure";
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
	if (path === "/runs") return <Runs />;
	const trial = path.match(/^\/runs\/([^/]+)\/trials\/([^/]+)$/);
	if (trial?.[1] && trial[2])
		return <TrialView runId={trial[1]} trialId={trial[2]} />;
	const run = path.match(/^\/runs\/([^/]+)$/);
	if (run?.[1]) return <RunView runId={run[1]} />;
	return <Leaderboard />;
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
			<span className="mr-2 font-semibold">Eval Studio</span>
			{tab("/", "Review", path === "/")}
			{tab("/configure", "Configure", path === "/configure")}
			{tab("/runs", "Runs", path === "/runs")}
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
