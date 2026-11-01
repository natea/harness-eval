/**
 * The app dropdown's logic, shared by the Studio and Dashboard frontends
 * (add-app-filter-dropdown). Browser-safe: no node imports. The selection lives in
 * the page URL as `?app=`; a value matching no listed run falls back to "All".
 */

import { useState } from "react";

export const ALL_APPS = "all";
const PARAM = "app";

export interface AppRef {
	name: string;
	title: string;
	appLabel?: string;
}
export interface AppRun {
	summary?: { target?: AppRef | null; scores?: unknown[] };
}

export interface AppOption {
	value: string;
	label: string;
}

/** One option per app present in the runs, sorted by label ("All" not included). */
export function appOptions(
	targets: (AppRef | null | undefined)[],
): AppOption[] {
	const byName = new Map<string, string>();
	for (const t of targets)
		if (t && !byName.has(t.name))
			byName.set(t.name, t.appLabel ?? `${t.title} (${t.name})`);
	return [...byName]
		.map(([value, label]) => ({ value, label }))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** The effective selection: an unknown or missing value means "All". */
export function effectiveApp(raw: string | null, options: AppOption[]): string {
	return raw && options.some((o) => o.value === raw) ? raw : ALL_APPS;
}

export function matchesApp(
	target: AppRef | null | undefined,
	app: string,
): boolean {
	return app === ALL_APPS || target?.name === app;
}

/** True when the selected app has runs but none carries leaderboard scores (brownfield). */
export function appHasNoScores(runs: AppRun[], app: string): boolean {
	if (app === ALL_APPS) return false;
	const inApp = runs.filter((r) => matchesApp(r.summary?.target, app));
	return inApp.length > 0 && inApp.every((r) => !r.summary?.scores?.length);
}

export const NO_SCORES_MESSAGE =
	"No leaderboard scores for this app: its brownfield runs are graded on their own run pages, linked below.";

/** `search` with the app parameter set, or removed for "All". */
export function withAppParam(search: string, app: string): string {
	const p = new URLSearchParams(search);
	if (app === ALL_APPS) p.delete(PARAM);
	else p.set(PARAM, app);
	const s = p.toString();
	return s ? `?${s}` : "";
}

/** URL-backed selection: `[raw value from the URL, setter that updates the URL]`. */
export function useAppParam(): [string | null, (app: string) => void] {
	const [raw, setRaw] = useState<string | null>(() =>
		new URLSearchParams(window.location.search).get(PARAM),
	);
	const set = (app: string) => {
		const { pathname, search, hash } = window.location;
		window.history.replaceState(
			null,
			"",
			`${pathname}${withAppParam(search, app)}${hash}`,
		);
		setRaw(app === ALL_APPS ? null : app);
	};
	return [raw, set];
}
