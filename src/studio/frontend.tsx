import { createRoot } from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip";
import { Leaderboard } from "./views/Leaderboard";
import "./index.css";

/** Eval Studio — review view (task 2). Run/trial drill-down routes are added
 *  next; for now all paths render the leaderboard. */
function App() {
	return (
		<TooltipProvider delayDuration={150}>
			<main className="mx-auto max-w-[1100px] p-6">
				<Leaderboard />
			</main>
		</TooltipProvider>
	);
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
