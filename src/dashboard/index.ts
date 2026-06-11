#!/usr/bin/env bun
import { getRun, loadRunIndex } from "./data";
/**
 * harness-eval results dashboard (read-only, localhost by default).
 *   bun run dashboard            # http://127.0.0.1:4870
 *   bun run dashboard --port N
 */
import index from "./index.html";

const portIdx = process.argv.indexOf("--port");
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 4870;

const server = Bun.serve({
	hostname: "127.0.0.1",
	port,
	routes: {
		"/": index,
		"/runs/:id": index,
		"/runs/:id/trials/:trialId": index,
		"/api/runs": {
			GET: () => {
				// Leaderboard payload: index without per-trial step evidence (kept
				// light per design D5; grades join happens on trial routes).
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
	},
	development: { hmr: true },
});

console.log(`harness-eval dashboard: http://127.0.0.1:${server.port}`);
