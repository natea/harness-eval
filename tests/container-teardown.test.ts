import { describe, expect, test } from "bun:test";
import {
	type TeardownOptions,
	parseContainerListNames,
	tearDownContainer,
} from "../src/providers/cli-container";
import {
	type ProcRunner,
	lsofOwnedBy,
	parsePids,
	reapAppleContainer,
} from "../src/providers/reap";

type Call = { binary: string; args: string[] };

/** A scripted `cli` stand-in: exit codes keyed by the verb (args[0]). */
function fakeCli(exitByVerb: Record<string, number>) {
	const calls: Call[] = [];
	const run = (async (binary: string, args: string[]) => {
		calls.push({ binary, args });
		const verb = args[0] ?? "";
		return { exitCode: exitByVerb[verb] ?? 0, stdout: "", stderr: "" };
	}) as unknown as TeardownOptions["run"];
	return { run, calls };
}

describe("tearDownContainer ladder (tasks 1.2, 1.3)", () => {
	test("force-remove succeeds → method 'remove', no escalation", async () => {
		const { run, calls } = fakeCli({ rm: 0 });
		const res = await tearDownContainer({ binary: "docker", name: "he-x", run });
		expect(res).toEqual({ freed: true, method: "remove" });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.args).toEqual(["rm", "-f", "he-x"]);
	});

	test("force-remove fails, kill succeeds → method 'kill'", async () => {
		const { run, calls } = fakeCli({ rm: 1, kill: 0 });
		const res = await tearDownContainer({ binary: "container", name: "he-x", run });
		expect(res).toEqual({ freed: true, method: "kill" });
		// remove → kill → best-effort remove again
		expect(calls.map((c) => c.args[0])).toEqual(["rm", "kill", "rm"]);
	});

	test("CLI wedged (remove+kill fail) → OS reap frees it → method 'reap'", async () => {
		const { run } = fakeCli({ rm: 1, kill: 1 });
		let reapedName = "";
		const res = await tearDownContainer({
			binary: "container",
			name: "he-wedged",
			run,
			reapProcesses: async (n) => {
				reapedName = n;
				return 2;
			},
		});
		expect(res).toEqual({ freed: true, method: "reap" });
		expect(reapedName).toBe("he-wedged");
	});

	test("everything fails, nothing reaped → method 'leaked' with a manual hint", async () => {
		const { run } = fakeCli({ rm: 1, kill: 1 });
		const logs: string[] = [];
		const res = await tearDownContainer({
			binary: "container",
			name: "he-stuck",
			run,
			reapProcesses: async () => 0,
			log: (m) => logs.push(m),
		});
		expect(res).toEqual({ freed: false, method: "leaked" });
		expect(logs.some((l) => /survived teardown/.test(l))).toBe(true);
		expect(logs.some((l) => /he-stuck/.test(l))).toBe(true);
	});

	test("never throws even if the runner rejects", async () => {
		const run = (async () => {
			throw new Error("exec blew up");
		}) as unknown as TeardownOptions["run"];
		// reapProcesses also rejects — must still resolve to a leak, not throw.
		const res = await tearDownContainer({
			binary: "container",
			name: "he-x",
			run,
			reapProcesses: async () => {
				throw new Error("pgrep blew up");
			},
		}).catch(() => "THREW");
		expect(res).not.toBe("THREW");
	});
});

describe("reapAppleContainer guard (tasks 2.1, 2.2)", () => {
	test("kills the runtime + only the VM that owns this trial's files", async () => {
		const calls: Call[] = [];
		const run: ProcRunner = async (binary, args) => {
			calls.push({ binary, args });
			if (binary === "pgrep" && args[1]?.includes("container-runtime-linux"))
				return { exitCode: 0, stdout: "100\n", stderr: "" };
			if (binary === "pgrep" && args[1]?.includes("VirtualMachine"))
				return { exitCode: 0, stdout: "200\n300\n", stderr: "" };
			if (binary === "lsof" && args[1] === "200")
				return {
					exitCode: 0,
					stdout: "… /Library/.../com.apple.container/containers/he-x/disk.img",
					stderr: "",
				};
			if (binary === "lsof" && args[1] === "300")
				return {
					exitCode: 0,
					stdout: "… /containers/he-OTHER-trial/disk.img",
					stderr: "",
				};
			return { exitCode: 0, stdout: "", stderr: "" };
		};
		const n = await reapAppleContainer("he-x", run);
		expect(n).toBe(2); // runtime 100 + owned VM 200
		const kill = calls.find((c) => c.binary === "kill");
		expect(kill?.args).toEqual(["-9", "100", "200"]); // 300 (unrelated VM) spared
	});

	test("returns 0 and signals nothing when no runtime/VM matches", async () => {
		const calls: Call[] = [];
		const run: ProcRunner = async (binary, args) => {
			calls.push({ binary, args });
			return { exitCode: 1, stdout: "", stderr: "" };
		};
		expect(await reapAppleContainer("he-none", run)).toBe(0);
		expect(calls.some((c) => c.binary === "kill")).toBe(false);
	});

	test("lsofOwnedBy matches the trial's container dir only", () => {
		expect(lsofOwnedBy("a\n/foo/containers/he-x/disk\nb", "he-x")).toBe(true);
		expect(lsofOwnedBy("/foo/containers/he-y/disk", "he-x")).toBe(false);
	});

	test("parsePids extracts positive integers", () => {
		expect(parsePids("100\n200\n\n")).toEqual([100, 200]);
		expect(parsePids("")).toEqual([]);
	});
});

describe("parseContainerListNames (task 3.1)", () => {
	test("parses the Apple `container list` table, dropping the header", () => {
		const table = [
			"ID                 IMAGE                       OS     STATE",
			"he-superpowers-t1  harness-eval-trial:2.1.170  linux  running",
			"he-gsd-t1          harness-eval-trial:2.1.170  linux  running",
		].join("\n");
		expect(parseContainerListNames(table)).toEqual([
			"he-superpowers-t1",
			"he-gsd-t1",
		]);
	});

	test("empty / header-only input yields no names", () => {
		expect(parseContainerListNames("")).toEqual([]);
		expect(parseContainerListNames("ID  IMAGE  STATE")).toEqual([]);
	});
});
