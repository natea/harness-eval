import { expect, test } from "bun:test";
import {
	diffSizeRatio,
	diffStats,
	localization,
} from "../src/brownfield/signals";

const patch = `diff --git a/src/a.py b/src/a.py
--- a/src/a.py
+++ b/src/a.py
@@ -1,2 +1,3 @@
 x = 1
+y = 2
 z = 3
diff --git a/tests/t.py b/tests/t.py
--- a/tests/t.py
+++ b/tests/t.py
@@ -1 +1 @@
-a
+b
`;

test("diff stats count files and changed lines", () => {
	const s = diffStats(patch);
	expect(s.files).toEqual(["src/a.py", "tests/t.py"]);
	expect(s.additions).toBe(2);
	expect(s.deletions).toBe(1);
});

test("localization precision/recall/f1", () => {
	const l = localization(["src/a.py", "docs/x.md"], ["src/a.py", "tests/t.py"]);
	expect(l.matched).toEqual(["src/a.py"]);
	expect(l.missed).toEqual(["tests/t.py"]);
	expect(l.extra).toEqual(["docs/x.md"]);
	expect(l.precision).toBeCloseTo(0.5);
	expect(l.recall).toBeCloseTo(0.5);
	expect(l.f1).toBeCloseTo(0.5);
});

test("diff size ratio is relative to the reference", () => {
	const cand = diffStats(patch);
	expect(diffSizeRatio(cand, cand)).toBe(1);
	expect(
		diffSizeRatio(cand, { files: [], additions: 0, deletions: 0 }),
	).toBeNull();
});
