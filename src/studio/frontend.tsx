import { createRoot } from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip";
import { Leaderboard } from "./views/Leaderboard";
import { RunView } from "./views/RunView";
import { TrialView } from "./views/TrialView";
import "./index.css";

/** Eval Studio — review view (task 2). Path-based routing mirrors the dashboard:
 *  / → leaderboard, /runs/:id → scorecard, /runs/:id/trials/:trialId → trial. */
function Routed() {
	const path = window.location.pathname;
	const trial = path.match(/^\/runs\/([^/]+)\/trials\/([^/]+)$/);
	if (trial?.[1] && trial[2])
		return <TrialView runId={trial[1]} trialId={trial[2]} />;
	const run = path.match(/^\/runs\/([^/]+)$/);
	if (run?.[1]) return <RunView runId={run[1]} />;
	return <Leaderboard />;
}

function App() {
	return (
		<TooltipProvider delayDuration={150}>
			<main className="mx-auto max-w-[1100px] p-6">
				<Routed />
			</main>
		</TooltipProvider>
	);
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
