import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CandidateEntry } from "../types";

/**
 * Produce a blind copy of a workspace for code-quality judging (task 6.4):
 * registered framework marker paths are removed so the judge cannot identify
 * which framework produced the artifact (grading-rubric spec: judge
 * independence). ALL registered markers across ALL candidates are scrubbed
 * from every workspace, so absence of a marker is not itself a signal.
 */
export function scrubWorkspace(
  workspaceDir: string,
  blindDir: string,
  allCandidates: CandidateEntry[],
): string[] {
  rmSync(blindDir, { recursive: true, force: true });
  cpSync(workspaceDir, blindDir, { recursive: true });
  const removed: string[] = [];
  const markers = new Set<string>([
    ...allCandidates.flatMap((c) => c.markerPaths),
    // Harness-level traces that could identify tooling, not just framework:
    ".claude/",
    "CLAUDE.md",
    ".planning/",
  ]);
  for (const marker of markers) {
    const target = join(blindDir, marker.replace(/\/$/, ""));
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      removed.push(marker);
    }
  }
  return removed;
}
