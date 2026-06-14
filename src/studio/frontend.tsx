import { createRoot } from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip";
import { Configure } from "./views/Configure";
import { Leaderboard } from "./views/Leaderboard";
import { RunView } from "./views/RunView";
import { TrialView } from "./views/TrialView";
import "./index.css";

/** Path-based routing: / → leaderboard, /configure → configure,
 *  /runs/:id → scorecard, /runs/:id/trials/:trialId → trial. */
function Routed() {
	const path = window.location.pathname;
	if (path === "/configure") return <Configure />;
	const trial = path.match(/^\/runs\/([^/]+)\/trials\/([^/]+)$/);
	if (trial?.[1] && trial[2])
		return <TrialView runId={trial[1]} trialId={trial[2]} />;
	const run = path.match(/^\/runs\/([^/]+)$/);
	if (run?.[1]) return <RunView runId={run[1]} />;
	return <Leaderboard />;
}

function Nav() {
	const path = window.location.pathname;
	const isConfig = path === "/configure";
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
			{tab("/", "Review", !isConfig)}
			{tab("/configure", "Configure", isConfig)}
		</nav>
	);
}

function App() {
	return (
		<TooltipProvider delayDuration={150}>
			<main className="mx-auto max-w-[1100px] p-6">
				<Nav />
				<Routed />
			</main>
		</TooltipProvider>
	);
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
