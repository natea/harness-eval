import Anthropic from "@anthropic-ai/sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type CriterionScore,
  type QualityCriterion,
  type QualityResult,
} from "../types";

const execFileAsync = promisify(execFile);

export const CRITERIA: { key: QualityCriterion; prompt: string }[] = [
  {
    key: "tests",
    prompt:
      "Are the tests meaningful and passing? Run the artifact's own test suite and weigh observed results heavily: coverage of core behaviors, assertions that would actually catch regressions, no trivially-green tests.",
  },
  {
    key: "architecture",
    prompt:
      "Does the structure match the layered architecture in SPEC-REFERENCE.md §3.2 (policy/config/coordination/execution/integration/observability)? Are boundaries clean and dependencies pointed the right way?",
  },
  {
    key: "errorHandling",
    prompt:
      "Is error handling robust? Typed errors where the spec requires, no swallowed failures, retries/timeouts where external calls occur, crash-safety in the daemon loop.",
  },
  {
    key: "deadCode",
    prompt:
      "Is the codebase free of dead code, duplicated logic, vestigial scaffolding, and unused dependencies?",
  },
  {
    key: "documentation",
    prompt:
      "Is documentation adequate? README/setup accuracy, WORKFLOW.md contract documented, non-obvious decisions explained where they matter.",
  },
];

const JUDGE_SYSTEM = `You are a senior engineer reviewing an anonymous codebase that implements a daemon service against the specification provided at SPEC-REFERENCE.md in the workspace.

Score ONE criterion from 0-10. Base your score on evidence: run commands (tests, linters, type checkers, grep) and cite what you observed. Do not assume; verify. Do not attempt to identify who or what produced the code — judge the artifact only. NEVER modify the artifact.

When done, call record_score exactly once with {score: 0-10, justification: "<evidence-citing rationale>"}.`;

export interface JudgeOptions {
  model: string;
  blindWorkspaceDir: string;
  samples?: number;
  maxIterationsPerSample?: number;
  apiKey?: string;
  client?: Anthropic;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

async function judgeOneSample(
  client: Anthropic,
  opts: JudgeOptions,
  criterion: (typeof CRITERIA)[number],
): Promise<{ score: number; justification: string }> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Criterion: ${criterion.prompt}\nWorkspace: ${opts.blindWorkspaceDir}` },
  ];
  const tools: Anthropic.Tool[] = [
    {
      name: "bash",
      description: "Run a shell command in the workspace (read-only intent).",
      input_schema: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
    {
      name: "record_score",
      description: "Record the criterion score. Call exactly once, then stop.",
      input_schema: {
        type: "object",
        properties: {
          score: { type: "number", minimum: 0, maximum: 10 },
          justification: { type: "string" },
        },
        required: ["score", "justification"],
      },
    },
  ];

  const maxIterations = opts.maxIterationsPerSample ?? 25;
  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: opts.model,
      max_tokens: 2048,
      temperature: 0,
      system: JUDGE_SYSTEM,
      messages,
      tools,
    });
    messages.push({ role: "assistant", content: response.content });
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      if (use.name === "record_score") {
        const input = use.input as { score: number; justification: string };
        return {
          score: Math.max(0, Math.min(10, Number(input.score))),
          justification: String(input.justification),
        };
      }
      const input = use.input as { command: string };
      let output: string;
      try {
        const { stdout, stderr } = await execFileAsync("bash", ["-c", input.command], {
          cwd: opts.blindWorkspaceDir,
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        output = `exit 0\n${stdout.slice(0, 12000)}\n${stderr.slice(0, 3000)}`;
      } catch (err) {
        const e = err as { code?: number | string; stdout?: string; stderr?: string };
        output = `exit ${e.code ?? "error"}\n${(e.stdout ?? "").slice(0, 12000)}\n${(e.stderr ?? String(err)).slice(0, 3000)}`;
      }
      results.push({ type: "tool_result", tool_use_id: use.id, content: output });
    }
    messages.push({ role: "user", content: results });
  }
  return { score: 0, justification: "judge did not record a score within iteration budget" };
}

/**
 * Code-quality judge (task 6.5): pinned non-worker model, temperature 0,
 * tool access, 3 independent samples per criterion, median taken
 * (grading-rubric spec). Operates only on the scrubbed blind workspace.
 */
export async function judgeQuality(opts: JudgeOptions): Promise<QualityResult> {
  const client =
    opts.client ?? new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
  const samples = opts.samples ?? 3;
  const criteria: CriterionScore[] = [];
  for (const criterion of CRITERIA) {
    const runs: { score: number; justification: string }[] = [];
    for (let s = 0; s < samples; s++) {
      runs.push(await judgeOneSample(client, opts, criterion));
    }
    const scores = runs.map((r) => r.score);
    const med = median(scores);
    const medianRun = runs.find((r) => r.score === med) ?? runs[0];
    criteria.push({
      criterion: criterion.key,
      samples: scores,
      score: med,
      justification: medianRun?.justification ?? "",
    });
  }
  const mean = criteria.reduce((a, c) => a + c.score, 0) / criteria.length;
  return {
    judgeModel: opts.model,
    criteria,
    score: Math.round(mean * 10 * 100) / 100, // 0-10 mean → 0-100
  };
}
