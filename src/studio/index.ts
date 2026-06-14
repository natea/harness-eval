#!/usr/bin/env bun
/**
 * harness-eval Eval Studio (local, read-only review; run-launch added in
 * task 3). Served via Bun.serve HTML imports; Tailwind is processed by
 * bun-plugin-tailwind (see bunfig.toml). Reuses the dashboard data layer and
 * the shared scoring module so the studio is CLI-parity by construction.
 *   bun run studio            # http://127.0.0.1:4871
 *   bun run studio --port N
 */
import { getRun, loadRunIndex } from "../dashboard/data";
import { loadTarget } from "../targets";
import index from "./index.html";
import { getQueue, launchRun } from "./launcher";
import {
	type StudioRunRequest,
	studioOptions,
	validateRunRequest,
} from "./options";

const portIdx = process.argv.indexOf("--port");
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 4871;

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

		// Launch a run (dry-run only from the studio; real runs use the CLI
		// command). Background; returns the runId immediately.
		"/api/launch": {
			POST: async (req) => {
				const body = (await req.json().catch(() => ({}))) as Partial<
					StudioRunRequest
				> & { dryRun?: boolean };
				const out = launchRun(body, { dryRun: body.dryRun === true });
				return Response.json(out, { status: out.errors ? 400 : 200 });
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

		// Step descriptions for drill-down tooltips (default target).
		"/api/steps": {
			GET: () => {
				try {
					const t = loadTarget("symphony-daemon");
					const out: Record<string, string> = {};
					for (const step of t.plan.steps) {
						out[step.id] =
							`${step.description}\n\nCheck: ${step.check.trim()}` +
							(step.fatal ? "\n(FATAL gate)" : "") +
							(step.bonus ? "\n(bonus — not scored)" : "");
					}
					return Response.json(out);
				} catch {
					return Response.json({});
				}
			},
		},
	},
	development: { hmr: true, console: true },
});

console.log(`Eval Studio: http://127.0.0.1:${server.port}`);
