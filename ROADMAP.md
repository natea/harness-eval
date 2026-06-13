# Roadmap

Status of features specified under [`openspec/changes/`](https://github.com/natea/harness-eval/tree/main/openspec/changes).
Each item links to its OpenSpec change (proposal → design → spec deltas →
tasks); task counts reflect that change's `tasks.md`.

For shipped-on-`main` capabilities, see the [README](README.md#status).

## Built, pending merge (done on a branch, not yet on `main`)

These are implemented and validated but live on feature branches awaiting
review/merge.

- **Isolation providers: Docker, E2B, macOS Virtualization** — on the
  [`pluggable-providers`](https://github.com/natea/harness-eval/tree/pluggable-providers)
  branch (one `SandboxProvider` factory + all three providers). Live-validated:
  E2B real trial (11.2m / $3.46 / 47 turns), macOS-VZ on Apple's `container`
  CLI, E2B smoke green. A few finishing tasks remain per change:
  [`add-docker-local-provider`](https://github.com/natea/harness-eval/tree/main/openspec/changes/add-docker-local-provider)
  (10/12),
  [`add-e2b-sandbox-provider`](https://github.com/natea/harness-eval/tree/main/openspec/changes/add-e2b-sandbox-provider)
  (9/11),
  [`add-macos-vz-provider`](https://github.com/natea/harness-eval/tree/main/openspec/changes/add-macos-vz-provider)
  (10/11). *(macOS-VZ depends on the Docker change's shared trial image.)*
- **PRD library + bring-your-own-PRD** — [`add-prd-library`](https://github.com/natea/harness-eval/tree/main/openspec/changes/add-prd-library),
  PR #1 (complete).
- **Pluggable models / GLM via z.ai** — [`add-pluggable-models`](https://github.com/natea/harness-eval/tree/main/openspec/changes/add-pluggable-models),
  PR #2 (12/13).

## Not yet built

- **Eval Studio (shadcn/ui)** — [`add-eval-studio-ui`](https://github.com/natea/harness-eval/tree/shadcn-eval-studio/openspec/changes/add-eval-studio-ui) · 0/13
  A run-configuration + review web UI superseding the read-only dashboard:
  pick target × frameworks × harness × model, launch/queue runs, and review
  results on shadcn/ui components themed from a portable `DESIGN.md` token
  spec. *(On the `shadcn-eval-studio` branch.)*
- **Additional model providers (Kimi K2 / MiniMax M3 / Qwen Coder)** —
  [`add-pluggable-models`](https://github.com/natea/harness-eval/tree/main/openspec/changes/add-pluggable-models)
  task 4.4, deferred pending API keys. Config-only once keys arrive (an
  Anthropic-compatible profile + key + redaction, then probe + smoke) — the
  model registry already supports new providers with no code changes.
- **Language-effectiveness evaluation (exploration)** — [`explore-language-eval`](https://github.com/natea/harness-eval/tree/main/openspec/changes/explore-language-eval) · 0/11
  Feasibility spike to evaluate *programming languages* (hold harness+model
  fixed, vary the implementation language) — inspired by
  [`mame/ai-coding-lang-bench`](https://github.com/mame/ai-coding-lang-bench).
  A language-neutral polyglot target + black-box test suite, pass@1 plus
  efficiency (time/cost/tokens/LOC), and a go/no-go recommendation for a full
  build.

---

*Reflects OpenSpec change status at time of writing. Run `openspec list` on
each branch for live task counts.*
