import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { buildSealedRepo, verifySealed } from "../src/brownfield/seal";

let root: string;
let clone: string;
let base: string;
let fix: string;

async function commit(msg: string): Promise<string> {
	writeFileSync(join(clone, "f.txt"), `${msg}\n`);
	await $`git -C ${clone} add f.txt && git -C ${clone} -c user.name=t -c user.email=t@t commit -q -m ${msg}`.quiet();
	return (await $`git -C ${clone} rev-parse HEAD`.text()).trim();
}

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), "seal-"));
	clone = join(root, "clone");
	await $`git init -q -b main ${clone}`.quiet();
	await commit("one");
	await $`git -C ${clone} tag v1`.quiet();
	base = await commit("two");
	fix = await commit("the fix");
	await $`git -C ${clone} tag v2`.quiet();
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("sealed base repository (task 3.1)", () => {
	test("contains base's history and past tags, not the fix or future tags", async () => {
		const dest = join(root, "sealed");
		await buildSealedRepo(clone, base, dest);
		expect(await verifySealed(dest, base, [fix])).toEqual([]);
		expect(
			(await $`git -C ${dest} log --all --format=%s`.text()).trim().split("\n"),
		).toEqual(["two", "one"]);
		expect((await $`git -C ${dest} tag`.text()).trim()).toBe("v1");
		expect((await $`git -C ${dest} remote`.text()).trim()).toBe("");
		expect(
			(await $`git -C ${dest} cat-file -e ${fix}`.nothrow().quiet()).exitCode,
		).not.toBe(0);
	});

	test("verification catches a repo that still holds the future", async () => {
		const leaky = join(root, "leaky");
		await $`git clone -q ${clone} ${leaky}`.quiet();
		await $`git -C ${leaky} checkout -q ${base}`.quiet();
		const problems = await verifySealed(leaky, base, [fix]);
		expect(problems.some((p) => p.startsWith("future commit present"))).toBe(
			true,
		);
		expect(problems.some((p) => p.startsWith("refs reach commits"))).toBe(true);
		expect(problems.some((p) => p.startsWith("remotes configured"))).toBe(true);
	});

	test("refuses a non-empty destination", async () => {
		const dest = join(root, "occupied");
		await $`mkdir -p ${dest}`.quiet();
		writeFileSync(join(dest, "x"), "x");
		await expect(buildSealedRepo(clone, base, dest)).rejects.toThrow(
			/not empty/,
		);
	});
});
