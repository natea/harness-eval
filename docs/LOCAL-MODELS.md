# Local Models

This project can run local Ollama worker models through the Codex harness using
Codex OSS mode:

```sh
bun run src/cli.ts model probe ollama-qwen3.6-35b
bun run src/cli.ts run --candidates superpowers --trials 1 \
  --provider worktree --harness codex --worker-model ollama-qwen3.6-35b
```

## Profiles

Local worker profiles live in `config/models.yaml`:

- `ollama-qwen3-coder`
- `ollama-llama3.1`
- `ollama-qwen3.6-35b`
- `ollama-gemma4`
- `ollama-qwen3.6-judge` (judge profile, Ollama OpenAI-compatible `/v1`)
- `ollama-gemma4-judge` (judge profile, Ollama OpenAI-compatible `/v1`)

Worker profiles use `transport: codex`, `authKind: none`, and `ossProvider` set
to `ollama`. Local judge profiles use `transport: openai-compat`,
`baseUrl: http://localhost:11434/v1`, and `authKind: none`. They intentionally
omit pricing, so reports record `tokens-only` instead of fabricated dollar cost.

## Decisions

- Codex is pinned to `0.142.0` because that version exposes
  `codex exec --oss --local-provider ollama`. The trial image asserts those
  flags during build.
- `authKind: none` means no credential is required. `authEnv` is optional only
  for this auth kind; all credentialed profiles must still name an env var.
- This change intentionally supports Ollama only. LM Studio, HuggingFace
  Inference Endpoints, TGI, vLLM, and other remote OpenAI-compatible services are
  out of scope until a later OpenSpec change justifies them.
- Validation should use a model that is actually present on the operator's local
  server. The checked worker smoke used `ollama-qwen3.6-35b` because that profile
  was installed; `ollama-qwen3-coder` stays in the registry as an example and
  should be probed only after `ollama pull qwen3-coder`.
- Codex OSS workers use Codex's built-in local-provider defaults. The probe honors
  `OLLAMA_BASE_URL`, but that variable is not threaded into Codex worker
  execution unless Codex later documents a supported override.
- LM Studio is deferred. LM Studio 0.4.10+1 with `qwen/qwen3.6-35b-a3b` was
  reachable via `/v1/models`, but Codex worker execution failed because LM Studio
  rejected Codex's tool schema (`tools.5.type`, `invalid_string`).
- `openai-compat` judge profiles drive the blind code-quality judge. The
  PRD-adherence evaluator remains on the Claude Code path by default because it is
  a separate adaptive evaluator loop and was not part of this transport port.
- Adherence and quality grading are recorded independently. If the Claude-only
  adherence evaluator cannot run, a local `openai-compat` quality judge still runs
  and writes partial `grades.json` evidence with `adherence: null`.
- Grading records include the selected evaluator/quality drivers and judge
  transport so local judge runs can be audited without inferring behavior from a
  profile name.
- Studio/CLI grading writes `judge-checkpoint.json` after each completed quality
  criterion. This matters for local models because full median-of-three judging can
  be slow; an interrupted run should be resumable without discarding completed
  criteria.
- `scripts/regrade-run.ts <run-dir> --judge-model <profile>` can resume a
  Studio-generated run with the same local judge profile and then finalize the
  run artifacts while preserving the local judge metadata.
- Judge prompts use an absolute blind-workspace path, and shell tools execute with
  that workspace as `cwd`; this avoids local models accidentally probing a nested
  relative path such as `runs/.../workspace-blind` from inside the workspace.
- `ollama-gemma4-judge` is kept alongside the larger `ollama-qwen3.6-judge` as a
  lighter validation profile. Both use the same OpenAI-compatible judge code path;
  the smaller profile is practical for quick reachability and fallback checks.
- Local endpoint URLs are documented in `.env.example` but are not redacted as
  secrets.
