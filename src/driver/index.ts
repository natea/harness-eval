import { type HarnessRegistry, resolveHarness } from "../harnesses";
import { claudeCodeDriver } from "./claude";
import { codexDriver } from "./codex";
import type { HarnessDriver } from "./types";

const DRIVERS_BY_BACKEND: Record<string, HarnessDriver> = {
	[claudeCodeDriver.id]: claudeCodeDriver,
	[codexDriver.id]: codexDriver,
};

export function getHarnessDriver(
	harness: string,
	harnesses?: HarnessRegistry,
): HarnessDriver {
	const definition = resolveHarness(harness, harnesses);
	const driver = DRIVERS_BY_BACKEND[definition.driver];
	if (!driver) {
		throw new UnsupportedHarnessError(
			`unsupported harness '${harness}' uses driver '${definition.driver}', but no runnable driver is registered`,
		);
	}
	return driver;
}

export function runnableHarnessIds(): string[] {
	return Object.keys(DRIVERS_BY_BACKEND);
}

export class UnsupportedHarnessError extends Error {}

export type { DriverResult, DriverRunOptions, HarnessDriver } from "./types";
