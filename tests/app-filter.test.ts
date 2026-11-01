import { describe, expect, test } from "bun:test";
import {
	ALL_APPS,
	appHasNoScores,
	appOptions,
	effectiveApp,
	matchesApp,
	withAppParam,
} from "../src/app-filter";
import { brownfieldApp, runApp } from "../src/run-app";

const bf = (taskId: string, repoDir = "Future-House__paper-qa") => ({
	provenance: { brownfield: { repoDir, taskId } },
});
const prd = new Map([["sha-web", { name: "web-app", title: "Barber Shop" }]]);

describe("run app identity", () => {
	test("PRD run: its target, found by content hash", () => {
		expect(runApp({ prdSha256: "sha-web", trials: [] }, prd)).toEqual({
			name: "web-app",
			title: "Barber Shop",
			appLabel: "Barber Shop (web-app)",
		});
	});
	test("brownfield run: one repo-level app, whatever its tasks", () => {
		const a = runApp({ prdSha256: "bundles", trials: [bf("pr1-issue2")] }, prd);
		const b = runApp(
			{
				prdSha256: "other",
				trials: [bf("pr3-issue4"), bf("pr5-issue6"), bf("pr7-issue8")],
			},
			prd,
		);
		expect(a?.name).toBe("Future-House/paper-qa");
		expect(a?.appLabel).toBe("Future-House/paper-qa (brownfield)");
		expect(b?.appLabel).toBe(a?.appLabel);
		expect(a?.title).toBe("Brownfield: pr1-issue2");
		expect(b?.title).toBe("Brownfield: 3 tasks");
	});
	test("unidentified run: PRD re-frozen, no brownfield trials", () => {
		expect(
			runApp({ prdSha256: "gone", trials: [{ provenance: {} }] }, prd),
		).toBeNull();
		expect(brownfieldApp([])).toBeNull();
	});
});

describe("app filter", () => {
	const web = {
		name: "web-app",
		title: "Barber Shop",
		appLabel: "Barber Shop (web-app)",
	};
	const pq = {
		name: "Future-House/paper-qa",
		title: "Brownfield: pr1-issue2",
		appLabel: "Future-House/paper-qa (brownfield)",
	};
	const pq2 = { ...pq, title: "Brownfield: pr3-issue4" };

	test("options: one per app, sorted, unidentified runs excluded", () => {
		expect(appOptions([web, pq, pq2, null, undefined])).toEqual([
			{ value: web.name, label: web.appLabel },
			{ value: pq.name, label: pq.appLabel },
		]);
	});
	test("unknown or missing URL value falls back to All", () => {
		const opts = appOptions([web]);
		expect(effectiveApp("web-app", opts)).toBe("web-app");
		expect(effectiveApp("nope", opts)).toBe(ALL_APPS);
		expect(effectiveApp(null, opts)).toBe(ALL_APPS);
	});
	test("All includes unidentified runs; an app excludes them", () => {
		expect(matchesApp(null, ALL_APPS)).toBe(true);
		expect(matchesApp(web, ALL_APPS)).toBe(true);
		expect(matchesApp(web, "web-app")).toBe(true);
		expect(matchesApp(pq, "web-app")).toBe(false);
		expect(matchesApp(null, "web-app")).toBe(false);
	});
	test("no-scores message: only for a selected app whose runs all lack scores", () => {
		const runs = [
			{ summary: { target: web, scores: [{}] } },
			{ summary: { target: pq, scores: [] } },
		];
		expect(appHasNoScores(runs, pq.name)).toBe(true);
		expect(appHasNoScores(runs, web.name)).toBe(false);
		expect(appHasNoScores(runs, ALL_APPS)).toBe(false);
		expect(appHasNoScores(runs, "nope")).toBe(false);
	});
	test("URL param: set, encode, clear for All, keep others", () => {
		expect(withAppParam("", "Future-House/paper-qa")).toBe(
			"?app=Future-House%2Fpaper-qa",
		);
		expect(withAppParam("?app=x&y=1", ALL_APPS)).toBe("?y=1");
		expect(withAppParam("?app=x", ALL_APPS)).toBe("");
	});
});
