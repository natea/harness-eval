import { describe, expect, test } from "bun:test";
import {
	providerAvailability,
	providerUnavailableReason,
} from "../src/studio/provider-availability";

const status = (id: string, env: Record<string, string | undefined>) => {
	const s = providerAvailability(env).find((p) => p.id === id);
	if (!s) throw new Error(`no provider ${id}`);
	return s;
};

describe("provider availability (eval-studio Configure)", () => {
	test("local providers need no credential; cloud ones do", () => {
		const env = {}; // no keys set
		expect(status("worktree", env).configured).toBe(true);
		expect(status("docker", env).configured).toBe(true);
		expect(status("macos-vz", env).configured).toBe(true);
		expect(status("daytona", env).configured).toBe(false);
		expect(status("daytona", env).requires).toBe("DAYTONA_API_KEY");
		expect(status("e2b", env).configured).toBe(false);
		expect(status("e2b", env).requires).toBe("E2B_API_KEY");
	});

	test("a set key marks the provider configured", () => {
		const env = { DAYTONA_API_KEY: "dtn_x" };
		expect(status("daytona", env).configured).toBe(true);
		expect(status("e2b", env).configured).toBe(false); // still missing
	});

	test("blank/whitespace key does not count as configured", () => {
		expect(status("e2b", { E2B_API_KEY: "   " }).configured).toBe(false);
	});

	test("providerUnavailableReason names the missing var, null when usable", () => {
		expect(providerUnavailableReason("daytona", {})).toContain(
			"DAYTONA_API_KEY",
		);
		expect(providerUnavailableReason("worktree", {})).toBeNull();
		expect(
			providerUnavailableReason("daytona", { DAYTONA_API_KEY: "k" }),
		).toBeNull();
	});
});
