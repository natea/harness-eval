"""Map a test patch to the pytest node IDs it touches.

Usage: python3 touched.py <worktree-with-patch-applied> <tests.patch>
Prints a JSON list of node IDs (file::test or file::Class::test).

Hunks inside a test function/class select it. Hunks inside a helper or fixture
select every test in that file that references the helper's name. Module-level
hunks (imports, constants) select nothing on their own. If a touched file yields
no tests, the whole file is selected as a fallback.
"""

import ast
import json
import re
import sys
from pathlib import Path

wt, patch = Path(sys.argv[1]), Path(sys.argv[2]).read_text(errors="replace")

# New-side line ranges per file from the unified diff.
ranges: dict[str, list[tuple[int, int]]] = {}
current = None
for line in patch.splitlines():
    if line.startswith("+++ "):
        p = line[4:].strip()
        current = None if p == "/dev/null" else re.sub(r"^b/", "", p)
    elif line.startswith("@@") and current:
        m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", line)
        if m:
            start, n = int(m.group(1)), int(m.group(2) or 1)
            ranges.setdefault(current, []).append((start, start + max(n, 1) - 1))

def is_test_file(p: str) -> bool:
    return bool(re.search(r"(^|/)test_[^/]*\.py$", p))

def overlaps(node: ast.AST, rs: list[tuple[int, int]]) -> bool:
    lo = min([d.lineno for d in getattr(node, "decorator_list", [])] + [node.lineno])
    hi = node.end_lineno or node.lineno
    return any(a <= hi and b >= lo for a, b in rs)

selected: list[str] = []
for f, rs in ranges.items():
    if not is_test_file(f) or not (wt / f).exists():
        continue
    tree = ast.parse((wt / f).read_text(errors="replace"))
    tests: list[tuple[str, ast.AST]] = []  # (node id, node)
    helpers: list[str] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith("test"):
                tests.append((f"{f}::{node.name}", node))
            elif overlaps(node, rs):
                helpers.append(node.name)
        elif isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            methods = [m for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))]
            touched_helper = False
            for m in methods:
                if m.name.startswith("test"):
                    tests.append((f"{f}::{node.name}::{m.name}", m))
                elif overlaps(m, rs):
                    touched_helper = True
            if touched_helper:  # fixture/helper inside the class: take the whole class
                selected.append(f"{f}::{node.name}")
    file_sel = [nid for nid, n in tests if overlaps(n, rs)]
    for h in helpers:
        file_sel += [nid for nid, n in tests if re.search(rf"\b{re.escape(h)}\b", ast.unparse(n))]
    if not file_sel and not any(s.startswith(f"{f}::") for s in selected):
        file_sel = [f]  # fallback: whole file
    selected += file_sel

print(json.dumps(sorted(set(selected))))
