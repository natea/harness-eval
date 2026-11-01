import { expect, test } from "bun:test";
import { alignPatches, splitPatch } from "../src/dashboard/brownfield-diff";

const file = (path: string, body = "+x = 1", extra = "") =>
	`diff --git a/${path} b/${path}\n${extra}--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${body}\n`;
const added = (path: string) =>
	`diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+new\n`;

test("splitPatch separates files and reads their status", () => {
	const files = splitPatch(file("a.py") + added("b.txt"));
	expect(files.map((f) => [f.path, f.status])).toEqual([
		["a.py", "modified"],
		["b.txt", "added"],
	]);
	expect(files[0]?.text.startsWith("diff --git a/a.py")).toBe(true);
	expect(files[0]?.text).not.toContain("b.txt");
});

test("splitPatch handles an empty patch", () => {
	expect(splitPatch("")).toEqual([]);
	expect(splitPatch(null)).toEqual([]);
});

test("splitPatch ignores hunk lines that look like file headers", () => {
	const [f] = splitPatch(file("a.py", "--- a/other.py\n+++ b/other.py"));
	expect(f?.path).toBe("a.py");
	expect(f?.oldPath).toBe("a.py");
});

test("splitPatch does not split on diff text inside a hunk", () => {
	const files = splitPatch(file("a.md", "+diff --git a/x b/x"));
	expect(files.map((f) => f.path)).toEqual(["a.md"]);
});

test("a rename pairs with the original file under either path", () => {
	const renamed =
		"diff --git a/old.py b/new.py\nsimilarity index 90%\nrename from old.py\nrename to new.py\n";
	const [f] = splitPatch(renamed);
	expect(f).toMatchObject({
		path: "new.py",
		oldPath: "old.py",
		status: "renamed",
	});
	const { rows, harnessOnly } = alignPatches(renamed, file("old.py"), null);
	expect(rows[0]?.harness?.path).toBe("new.py");
	expect(harnessOnly).toEqual([]);
});

test("aligns shared files, keeps missed ones, and separates harness-only files", () => {
	const { rows, harnessOnly, otherOriginalTests } = alignPatches(
		added("example.html") + file("pkg/utils.py") + file("tests/test_a.py"),
		file("pkg/utils.py") + file("pyproject.toml"),
		file("tests/test_a.py") + file("tests/test_b.py"),
	);
	expect(
		rows.map((r) => [r.path, r.harness?.path ?? null, r.hiddenTest]),
	).toEqual([
		["pkg/utils.py", "pkg/utils.py", false],
		["pyproject.toml", null, false],
		["tests/test_a.py", "tests/test_a.py", true],
	]);
	expect(harnessOnly.map((f) => f.path)).toEqual(["example.html"]);
	expect(otherOriginalTests.map((f) => f.path)).toEqual(["tests/test_b.py"]);
});

test("an empty harness patch still lists every original file", () => {
	const { rows, harnessOnly } = alignPatches("", file("a.py"), null);
	expect(rows.map((r) => r.harness)).toEqual([null]);
	expect(harnessOnly).toEqual([]);
});
