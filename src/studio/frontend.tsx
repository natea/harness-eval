import { createRoot } from "react-dom/client";
import { Badge } from "./components/ui/badge";
import "./index.css";

/** Scaffold smoke screen — proves Tailwind tokens + shadcn components render
 *  under Bun's bundler. Replaced by the review view in task 2. */
function App() {
	return (
		<main className="mx-auto max-w-[1100px] p-6">
			<h1 className="text-xl font-bold tracking-tight">Eval Studio</h1>
			<p className="mt-1 text-sm text-muted-foreground">
				shadcn/ui + <code className="font-mono">DESIGN.md</code> tokens — scaffold
				check
			</p>
			<div className="mt-4 rounded-lg border border-border bg-card p-4">
				<div className="flex flex-wrap items-center gap-2">
					<Badge>default</Badge>
					<Badge variant="ok">ok</Badge>
					<Badge variant="warn">capped</Badge>
					<Badge variant="danger">infra-failed</Badge>
					<Badge variant="outline">cross-vendor judge</Badge>
				</div>
				<button
					type="button"
					className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
				>
					Primary action
				</button>
			</div>
		</main>
	);
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
