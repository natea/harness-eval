#!/usr/bin/env bun
/**
 * harness-eval Eval Studio (local review + run launch). Dry runs (zero spend)
 * and authorized, budget-confirmed real runs both launch here as background
 * jobs; status + cancel via /api/queue + /api/cancel. Served via Bun.serve HTML
 * imports; Tailwind is processed by bun-plugin-tailwind (see bunfig.toml).
 * Reuses the dashboard data layer and shared scoring module so the studio is
 * CLI-parity by construction.
 *   bun run studio            # http://127.0.0.1:4871 (localhost-only)
 *   bun run studio --port N
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getRun, loadRunIndex } from "../dashboard/data";
import { loadTarget } from "../targets";
import index from "./index.html";
import { cancelRun, getQueue, launchRun } from "./launcher";
import {
	type StudioRunRequest,
	studioOptions,
	validateRunRequest,
} from "./options";

const portIdx = process.argv.indexOf("--port");
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 4871;

interface RunTarget {
	name: string;
	/** Human title from the PRD's first heading (the app being built). */
	title: string;
	/** Step id → description + concrete check (drill-down tooltips). */
	steps: Record<string, string>;
}

/** Identify which eval target a run built by matching its PRD content hash
 *  against the target library, so the studio can name the app and show the
 *  exact check behind each step — for whatever target the run actually used. */
function resolveRunTarget(runId: string): RunTarget | null {
	const sha = getRun(runId)?.results?.prdSha256;
	if (!sha) return null;
	for (const dir of readdirSync("targets")) {
		if (!existsSync(join("targets", dir, "target.yaml"))) continue;
		try {
			const t = loadTarget(dir);
			if (t.prdSha256 !== sha) continue;
			const title = t.prdContent.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? dir;
			const steps: Record<string, string> = {};
			for (const step of t.plan.steps) {
				steps[step.id] =
					`${step.description}\n\nCheck: ${step.check.trim()}` +
					(step.fatal ? "\n(FATAL gate)" : "") +
					(step.bonus ? "\n(bonus — not scored)" : "");
			}
			return { name: dir, title, steps };
		} catch {
			// skip unloadable target
		}
	}
	return null;
}

const server = Bun.serve({
	hostname: "127.0.0.1",
	port,
	routes: {
		"/": index,
		"/configure": index,
		"/runs": index,
		"/runs/:id": index,
		"/runs/:id/trials/:trialId": index,

		// Registry-driven option sources for the Configure view.
		"/api/options": { GET: () => Response.json(studioOptions()) },

		// Validate a run request with the same rules the CLI enforces; returns
		// inline errors, or the equivalent CLI command + budget envelope. Pure
		// validation — never launches anything.
		"/api/validate": {
			POST: async (req) => {
				const body = (await req.json().catch(() => ({}))) as Record<
					string,
					unknown
				>;
				return Response.json(validateRunRequest(body));
			},
		},

		// Launch a run. dryRun → zero-spend preview. Real runs require launch
		// authorization + an acknowledged budget confirmation; an unconfirmed real
		// run returns { needsConfirmation, budget } instead of launching. Background;
		// returns the runId immediately when it starts.
		"/api/launch": {
			POST: async (req) => {
				const body = (await req
					.json()
					.catch(() => ({}))) as Partial<StudioRunRequest> & {
					dryRun?: boolean;
				};
				const out = await launchRun(body, { dryRun: body.dryRun === true });
				const status = "errors" in out ? 400 : 200;
				return Response.json(out, { status });
			},
		},

		// Cancel a running studio job: no new trial starts; in-flight sandboxes
		// are torn down by the trial's teardown.
		"/api/cancel": {
			POST: async (req) => {
				const body = (await req.json().catch(() => ({}))) as { runId?: string };
				const out = cancelRun(body.runId ?? "");
				return Response.json(out, { status: out.ok ? 200 : 400 });
			},
		},

		// Live status of studio-launched runs.
		"/api/queue": { GET: () => Response.json(getQueue()) },

		// Leaderboard payload: index without per-trial step evidence (kept light;
		// grades join happens on the trial route).
		"/api/runs": {
			GET: () => {
				const entries = loadRunIndex().map((e) => ({
					runId: e.runId,
					dir: e.dir,
					supported: e.supported,
					schemaVersion: e.schemaVersion,
					error: e.error,
					summary: e.results
						? {
								config: {
									harness: e.results.config.harness,
									model: e.results.config.model,
									judgeModel: e.results.config.judgeModel,
									provider: e.results.config.provider,
									trialsPerCandidate: e.results.config.trialsPerCandidate,
								},
								weights: e.results.weights,
								scores: e.results.scores,
								inconclusive: e.results.inconclusive,
								startedAt: e.results.startedAt,
								prdSha256: e.results.prdSha256,
								testPlanSha256: e.results.testPlanSha256,
								workerModel: e.results.workerModel,
								judgeModelRef: e.results.judgeModel,
								crossVendorJudge: e.results.crossVendorJudge,
								costSource: e.results.costSource,
							}
						: undefined,
				}));
				return Response.json(entries);
			},
		},

		"/api/runs/:id": {
			GET: (req) => {
				const entry = getRun(req.params.id);
				if (!entry)
					return Response.json({ error: "not found" }, { status: 404 });
				return Response.json(entry);
			},
		},

		"/api/runs/:id/trials/:trialId": {
			GET: (req) => {
				const entry = getRun(req.params.id);
				const trial = entry?.results?.trials.find(
					(t) => t.provenance.trialId === req.params.trialId,
				);
				if (!trial)
					return Response.json({ error: "not found" }, { status: 404 });
				return Response.json(trial);
			},
		},

		// Which app a run built (PRD title + name) and the concrete check behind
		// each step — resolved from the run's actual target, not a hardcoded one.
		"/api/runs/:id/target": {
			GET: (req) => {
				const t = resolveRunTarget(req.params.id);
				return t
					? Response.json(t)
					: Response.json({ error: "not found" }, { status: 404 });
			},
		},
	},
	development: { hmr: true, console: true },
});

console.log(`Eval Studio: http://127.0.0.1:${server.port}`);
