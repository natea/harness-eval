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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getRun, loadRunIndex } from "../dashboard/data";
import { buildBrackets } from "../bracket/bracket";
import { buildInverseScaling } from "../report/inverse-scaling";
import { loadTarget } from "../targets";
import index from "./index.html";
import { cancelRun, getQueue, launchRun, regradeRun } from "./launcher";
import {
	type StudioRunRequest,
	studioOptions,
	validateRunRequest,
} from "./options";
import {
	previewManager,
	startTrialPreview,
	stopTrialPreview,
	trialInventory,
} from "../preview/studio";
import { liveStreamResponse } from "./live-stream";
import { reconcileRunStates, runNeedsGrading } from "./run-state";
import { trialTranscript } from "./transcript";

const portIdx = process.argv.indexOf("--port");
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 4871;

// Reconcile runs whose owning process died while we were down: relabel stale
// in-progress state to `interrupted` so they show as such (not running, not
// vanished). Never re-executes — recovery is operator-initiated.
const reconciled = reconcileRunStates();
if (reconciled.length)
	console.log(
		`reconciled ${reconciled.length} interrupted run(s): ${reconciled.join(", ")}`,
	);

interface RunTarget {
	name: string;
	/** Human title from the PRD's first heading (the app being built). */
	title: string;
	/** Step id → description + concrete check (drill-down tooltips). */
	steps: Record<string, string>;
}

/** PRD content hash → { name, title } for every target, built once. Lets any
 *  run be labelled with the app it built by matching its prdSha256 — the run
 *  itself doesn't record the target name. */
let targetByShaCache: Map<string, { name: string; title: string }> | null = null;
function targetBySha(): Map<string, { name: string; title: string }> {
	if (targetByShaCache) return targetByShaCache;
	const m = new Map<string, { name: string; title: string }>();
	for (const dir of readdirSync("targets")) {
		if (!existsSync(join("targets", dir, "target.yaml"))) continue;
		try {
			const t = loadTarget(dir);
			const title = t.prdContent.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? dir;
			m.set(t.prdSha256, { name: dir, title });
		} catch {
			// skip unloadable target
		}
	}
	targetByShaCache = m;
	return m;
}

/** Full target detail (incl. per-step checks) for a run, by prdSha256 match. */
function resolveRunTarget(runId: string): RunTarget | null {
	const sha = getRun(runId)?.results?.prdSha256;
	const hit = sha ? targetBySha().get(sha) : undefined;
	if (!sha || !hit) return null;
	try {
		const t = loadTarget(hit.name);
		const steps: Record<string, string> = {};
		for (const step of t.plan.steps) {
			steps[step.id] =
				`${step.description}\n\nCheck: ${step.check.trim()}` +
				(step.fatal ? "\n(FATAL gate)" : "") +
				(step.bonus ? "\n(bonus — not scored)" : "");
		}
		return { name: hit.name, title: hit.title, steps };
	} catch {
		return null;
	}
}

/** The input spec a run was graded against (input-spec-viewer): resolve the run's
 *  frozen PRD hash → target and serve its PRD + test-plan text read-only. When the
 *  hash matches no current target (PRD re-frozen since), report that rather than
 *  serving a substitute document — only the hash, not the text, is archived per run. */
function resolveRunPrd(runId: string): {
	name: string | null;
	title: string | null;
	prd: string | null;
	testPlan: string | null;
	sha: string;
	currentMatch: boolean;
} | null {
	const sha = getRun(runId)?.results?.prdSha256;
	if (!sha) return null; // run doesn't exist / isn't indexed
	const hit = targetBySha().get(sha);
	if (!hit)
		return {
			name: null,
			title: null,
			prd: null,
			testPlan: null,
			sha,
			currentMatch: false,
		};
	try {
		const t = loadTarget(hit.name);
		const planPath = join("targets", hit.name, "testplan.yaml");
		const testPlan = existsSync(planPath)
			? readFileSync(planPath, "utf8")
			: null;
		return {
			name: hit.name,
			title: hit.title,
			prd: t.prdContent,
			testPlan,
			sha,
			currentMatch: true,
		};
	} catch {
		return { name: hit.name, title: hit.title, prd: null, testPlan: null, sha, currentMatch: false };
	}
}

const server = Bun.serve({
	hostname: "127.0.0.1",
	port,
	// The live-build SSE stream (/api/runs/:id/trials/:trialId/stream) is long-lived
	// and quiet between agent turns; Bun's 10s default idleTimeout would kill it
	// mid-build. The stream also heartbeats every ~4s, but raise the ceiling so a
	// tick delayed under load can't still trip the timeout. Max is 255s.
	idleTimeout: 120,
	routes: {
		"/": index,
		"/configure": index,
		"/inverse-scaling": index,
		"/bracket": index,
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

		// Inverse-scaling view (explore-inverse-scaling-report): marginal harness
		// gain over the no-framework baseline vs. baseline strength, on the two
		// absolute axes. Derived read-only from runs/ — never the run-normalized
		// composite.
		"/api/inverse-scaling": {
			GET: async () =>
				Response.json(await buildInverseScaling("runs", "targets")),
		},

		// Bracket bakeoff (bracket-bakeoff): retrospective single-elim tournaments
		// built from existing graded entrants. Read-only over runs/.
		"/api/bracket": {
			GET: async () => Response.json(await buildBrackets("runs", "targets")),
		},

		// Resume grading for a run with built-but-ungraded trials (no rebuild).
		"/api/regrade": {
			POST: async (req) => {
				const body = (await req.json().catch(() => ({}))) as { runId?: string };
				const out = regradeRun(body.runId ?? "");
				return Response.json(out, { status: out.ok ? 200 : 400 });
			},
		},

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
					// Built-but-ungraded trials remain (e.g. a partial finalize) → the
					// run can be resumed-graded without rebuilding.
					regradable: runNeedsGrading(e.dir),
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
								// Which app/PRD this run built (resolved by content hash) so
								// the runs listing isn't ambiguous about the target.
								target: targetBySha().get(e.results.prdSha256) ?? null,
								testPlanSha256: e.results.testPlanSha256,
								workerModel: e.results.workerModel,
								judgeModelRef: e.results.judgeModel,
								crossVendorJudge: e.results.crossVendorJudge,
								costSource: e.results.costSource,
								// Total run cost = sum of per-trial telemetry (build spend);
								// undefined when no trial reported telemetry (so the column
								// shows "—" rather than a misleading $0.00).
								costUsd: e.results.trials.some((t) => t.telemetry)
									? e.results.trials.reduce(
											(a, t) => a + (t.telemetry?.totalCostUsd ?? 0),
											0,
										)
									: undefined,
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

		// Readable build conversation for a trial (trial-transcript-audit): the
		// SAME parser that writes conversation.md, served as structured turns so
		// the Conversation tab can lane request/response and collapse payloads.
		"/api/runs/:id/trials/:trialId/transcript": {
			GET: (req) => {
				const t = trialTranscript(req.params.id, req.params.trialId);
				return t
					? Response.json(t)
					: Response.json({ error: "no transcripts" }, { status: 404 });
			},
		},

		// Live build stream (live-build-stream): SSE of an in-progress trial's
		// redacted turns as they are written, then a `done` event for the client to
		// hand off to the archived transcript above. Read-only; localhost-bound.
		"/api/runs/:id/trials/:trialId/stream": {
			GET: (req) => liveStreamResponse(req.params.id, req.params.trialId),
		},

		// Which app a run built (PRD title + name) and the concrete check behind
		// each step — resolved from the run's actual target, not a hardcoded one.
		// The input spec a run was graded against (input-spec-viewer): PRD + test
		// plan, read-only, resolved by the run's frozen PRD hash.
		"/api/runs/:id/prd": {
			GET: (req) => {
				const p = resolveRunPrd(req.params.id);
				return p
					? Response.json(p)
					: Response.json({ error: "not found" }, { status: 404 });
			},
		},

		"/api/runs/:id/target": {
			GET: (req) => {
				const t = resolveRunTarget(req.params.id);
				return t
					? Response.json(t)
					: Response.json({ error: "not found" }, { status: 404 });
			},
		},

		// Read-only artifact audit for a trial (artifact-preview): built file tree,
		// cold-start contract, blind-copy presence, grades — never mutates the archive.
		"/api/runs/:id/trials/:trialId/inventory": {
			GET: (req) => {
				const inv = trialInventory(req.params.id, req.params.trialId);
				return inv
					? Response.json(inv)
					: Response.json({ error: "not found" }, { status: 404 });
			},
		},

		// Start/stop an isolated live demo of a trial's built artifact. Sandboxed
		// (docker) by default; host execution requires an explicit opt-in.
		"/api/preview/start": {
			POST: async (req) => {
				const b = (await req.json().catch(() => ({}))) as {
					runId?: string;
					trialId?: string;
					unsafeHost?: boolean;
					router?: "port" | "portless";
				};
				if (!b.runId || !b.trialId)
					return Response.json({ error: "runId + trialId required" }, { status: 400 });
				const out = await startTrialPreview(b.runId, b.trialId, {
					unsafeHost: b.unsafeHost,
					router: b.router,
				});
				const bad = "error" in out || "refused" in out;
				return Response.json(out, { status: bad ? 409 : 200 });
			},
		},
		"/api/preview/stop": {
			POST: async (req) => {
				const b = (await req.json().catch(() => ({}))) as {
					runId?: string;
					trialId?: string;
				};
				if (!b.runId || !b.trialId)
					return Response.json({ error: "runId + trialId required" }, { status: 400 });
				return Response.json(await stopTrialPreview(b.runId, b.trialId));
			},
		},
		"/api/preview/list": { GET: () => Response.json(previewManager.list()) },
	},
	development: { hmr: true, console: true },
});

console.log(`Eval Studio: http://127.0.0.1:${server.port}`);

// Tear down any running previews on shutdown so a container/port never leaks
// past the studio process (artifact-preview lifecycle).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
	process.on(sig, () => {
		void previewManager.stopAll().finally(() => process.exit(0));
	});
}
