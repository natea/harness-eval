import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { TestPlan } from "../types";

export class TestPlanError extends Error {}

/**
 * Symphony §18.1 REQUIRED-for-Conformance items mapped to the test-plan
 * steps that cover them. Coverage is validated programmatically (task 6.1):
 * every item must map to ≥1 existing, non-bonus step.
 */
export const REQUIRED_COVERAGE: Record<string, string[]> = {
  "workflow path selection (explicit + cwd default)": ["W-1"],
  "WORKFLOW.md loader front matter + body split": ["W-2"],
  "typed config layer with defaults and $ resolution": ["W-3"],
  "dynamic WORKFLOW.md watch/reload/re-apply": ["W-4"],
  "polling orchestrator with single-authority state": ["O-1"],
  "tracker client candidate fetch + state refresh + terminal fetch": ["T-1"],
  "workspace manager with sanitized per-issue workspaces": ["WS-1"],
  "workspace lifecycle hooks": ["WS-2"],
  "hook timeout config (hooks.timeout_ms default 60000)": ["WS-3"],
  "app-server subprocess client with JSON line protocol": ["A-1"],
  "codex launch command config (codex.command default)": ["A-2"],
  "strict prompt rendering with issue and attempt": ["P-1"],
  "exponential retry queue with continuation retries": ["R-1"],
  "configurable retry backoff cap": ["R-2"],
  "reconciliation stops runs on terminal/non-active states": ["R-3"],
  "workspace cleanup for terminal issues": ["WS-4"],
  "structured logs with issue_id/issue_identifier/session_id": ["L-1"],
  "operator-visible observability": ["L-2"],
};

export interface LoadedTestPlan {
  plan: TestPlan;
  sha256: string;
}

export function loadTestPlan(path: string, expectedPrdSha256?: string): LoadedTestPlan {
  const raw = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const parsed = TestPlan.safeParse(parse(raw));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new TestPlanError(`invalid test plan ${path}:\n${issues}`);
  }
  const plan = parsed.data;

  if (expectedPrdSha256 && plan.prdSha256 !== expectedPrdSha256) {
    throw new TestPlanError(
      `test plan targets PRD ${plan.prdSha256.slice(0, 12)}… but vendored PRD is ${expectedPrdSha256.slice(0, 12)}…`,
    );
  }

  const ids = new Set<string>();
  for (const s of plan.steps) {
    if (ids.has(s.id)) throw new TestPlanError(`duplicate step id ${s.id}`);
    ids.add(s.id);
  }

  // §18.1 coverage: every REQUIRED item maps to ≥1 existing non-bonus step.
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const gaps: string[] = [];
  for (const [item, stepIds] of Object.entries(REQUIRED_COVERAGE)) {
    const covering = stepIds.map((id) => byId.get(id)).filter((s) => s && !s.bonus);
    if (covering.length === 0) gaps.push(item);
  }
  if (gaps.length > 0) {
    throw new TestPlanError(`§18.1 items without non-bonus coverage:\n  ${gaps.join("\n  ")}`);
  }
  return { plan, sha256 };
}
