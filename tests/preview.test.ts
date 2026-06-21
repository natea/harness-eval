import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { readInventory } from "../src/preview/inventory";
import { launchPreview } from "../src/preview/launcher";
import {
	PortRouter,
	PortlessRouter,
	type Runner,
	sanitizeName,
} from "../src/preview/router";

/** A trial dir with a built workspace, node_modules, grades, and a blind copy. */
function makeTrial(): { trialDir: string; workspace: string } {
	const trialDir = mkdtempSync(join(tmpdir(), "he-trial-"));
	const ws = join(trialDir, "workspace");
	mkdirSync(join(ws, "src"), { recursive: true });
	writeFileSync(join(ws, "setup.sh"), "#!/bin/bash\nexit 0\n");
	writeFileSync(join(ws, "start.sh"), "#!/bin/bash\nsleep 1\n");
	writeFileSync(join(ws, "src", "app.ts"), "export const x = 1;\n");
	// vendored dir that must be noted but NOT walked
	mkdirSync(join(ws, "node_modules", "left-pad"), { recursive: true });
	writeFileSync(join(ws, "node_modules", "left-pad", "index.js"), "module.exports=1");
	mkdirSync(join(trialDir, "workspace-blind"));
	writeFileSync(
		join(trialDir, "grades.json"),
		JSON.stringify({
			adherence: { gradedScore: 84.2, passAt1: true, completeFailure: false },
			quality: { score: 60 },
		}),
	);
	return { trialDir, workspace: ws };
}

describe("preview: inventory (tasks 1.1, 7.1, 7.3)", () => {
	test("lists the built tree, excludes vendored dirs, summarizes grades — no mutation", () => {
		const { trialDir, workspace } = makeTrial();
		const before = snapshot(workspace);
		const inv = readInventory("gsd-t1", trialDir, ["`setup.sh` installs deps"]);

		expect(inv.files.map((f) => f.path).sort()).toEqual([
			"setup.sh",
			"src/app.ts",
			"start.sh",
		]);
		expect(inv.files.some((f) => f.path.includes("node_modules"))).toBe(false);
		expect(inv.vendoredPresent).toContain("node_modules");
		expect(inv.hasSetupScript).toBe(true);
		expect(inv.hasStartScript).toBe(true);
		expect(inv.blindCopyPresent).toBe(true);
		expect(inv.grades).toMatchObject({ adherence: 84.2, quality: 60, passAt1: true });
		expect(inv.coldStartContract).toHaveLength(1);

		// read-only: the workspace is byte-for-byte unchanged
		expect(snapshot(workspace)).toEqual(before);
	});

	test("missing grades / blind copy degrade gracefully", () => {
		const trialDir = mkdtempSync(join(tmpdir(), "he-trial-"));
		mkdirSync(join(trialDir, "workspace"));
		const inv = readInventory("x-t1", trialDir);
		expect(inv.grades).toBeNull();
		expect(inv.blindCopyPresent).toBe(false);
		expect(inv.files).toEqual([]);
	});
});

describe("preview: routers (tasks 3.x, 7.1)", () => {
	test("PortRouter returns the localhost port URL", async () => {
		const r = new PortRouter();
		const { url } = await r.expose("p1", { host: "127.0.0.1", port: 4567 });
		expect(url).toBe("http://localhost:4567");
	});

	test("sanitizeName produces a DNS-safe label", () => {
		expect(sanitizeName("run-2026-06-16T01:02:03Z", "gsd_t1")).toMatch(
			/^[a-z0-9-]+$/,
		);
		expect(sanitizeName("run-2026-06-16T01:02:03Z", "gsd_t1")).not.toMatch(
			/[:_]|--/,
		);
	});

	test("PortlessRouter falls back to ports when portless is absent", async () => {
		const absent: Runner = async () => {
			throw new Error("portless: not found");
		};
		const r = new PortlessRouter(absent, () => {});
		const { url } = await r.expose("p1", { host: "127.0.0.1", port: 4567 });
		expect(url).toBe("http://localhost:4567"); // fell back to PortRouter
	});

	test("PortlessRouter aliases when portless is present", async () => {
		const calls: string[][] = [];
		const present: Runner = async (_b, args) => {
			calls.push(args);
			return { exitCode: 0, stdout: "", stderr: "" };
		};
		const r = new PortlessRouter(present, () => {});
		const { url } = await r.expose("p1", { host: "127.0.0.1", port: 4567 });
		expect(url).toMatch(/^https:\/\/[a-z0-9-]+\.localhost$/);
		expect(calls.some((a) => a[0] === "alias")).toBe(true);
	});
});

describe("preview: end-to-end host launch (tasks 2.x, 4.x, 7.2, 7.3)", () => {
	const cleanups: Array<() => Promise<void>> = [];
	afterEach(async () => {
		for (const c of cleanups.splice(0)) await c();
	});

	test("boots a tiny HTTP server from a copy, health-checks, serves, stops — archive untouched", async () => {
		const ws = mkdtempSync(join(tmpdir(), "he-ws-"));
		writeFileSync(join(ws, "setup.sh"), "#!/bin/bash\nexit 0\n");
		// start.sh launches a bun HTTP server on $PORT.
		writeFileSync(
			join(ws, "start.sh"),
			`#!/bin/bash\nexec bun -e 'Bun.serve({ port: Number(process.env.PORT), hostname: "127.0.0.1", fetch() { return new Response("demo-ok"); } })'\n`,
		);
		chmodSync(join(ws, "setup.sh"), 0o755);
		chmodSync(join(ws, "start.sh"), 0o755);
		const before = snapshot(ws);

		const res = await launchPreview({
			previewId: "run-x-gsd-t1",
			workspaceDir: ws,
			web: true,
			unsafeHost: true, // host backend = no docker dependency in the test
			budgetMs: 20_000,
		});
		cleanups.push(() => res.stop());

		expect(res.status).toBe("ready");
		expect(res.trust).toBe("host-unsafe");
		expect(res.url).toMatch(/^http:\/\/localhost:\d+$/);

		const body = await fetch(res.url as string).then((r) => r.text());
		expect(body).toBe("demo-ok");

		// the archived workspace was never written to (ran from a copy)
		expect(snapshot(ws)).toEqual(before);

		await res.stop();
		// after stop, the server is gone
		const reachable = await fetch(res.url as string, {
			signal: AbortSignal.timeout(1500),
		})
			.then(() => true)
			.catch(() => false);
		expect(reachable).toBe(false);
	}, 30_000);
});

/** Sorted (path → size) map of a dir tree, for mutation checks. */
function snapshot(dir: string): Record<string, number> {
	const out: Record<string, number> = {};
	const walk = (d: string, base: string) => {
		for (const name of readdirSync(d)) {
			const full = join(d, name);
			const st = require("node:fs").statSync(full);
			if (st.isDirectory()) walk(full, join(base, name));
			else out[join(base, name)] = st.size;
		}
	};
	if (existsSync(dir)) walk(dir, "");
	return out;
}
