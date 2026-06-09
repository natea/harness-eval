use openspec to create a specification for setting up an eval framework that can definitively grade which coding harness performs best. the rubric should
  include, speed of execution, code quality, token spend, adherence to the PRD. Here's a grading framework that you can use:
  https://docs.langchain.com/oss/python/deepagents/rubric

  Or if that one is not appropriate, here's one called ViBench: https://www.linkedin.com/posts/pirroh_most-ai-coding-benchmarks-miss-what-actually-share-7467635499
  139035137-Kidg/?utm_source=share&utm_medium=member_desktop&rcm=ACoAAAANY00BWqXOfqz0D3TP9TgO3ENQIviGWvI

  These are the frameworks I'd like for you to evaluate:
  Superpowers: https://blog.fsck.com/2026/05/04/superpowers-5.1/
  Compound Engineering: https://every.to/guides/compound-engineering
  Agent Skills: https://addyosmani.com/blog/agent-skills/
  GSD: https://opengsd.net/

  you will probably need to evaluate each one in a Daytona sandbox or a Git worktree for isolation.
  here's a Daytona API KEY: dtn_d7525817678d37580a4371f5aa2566ef384a90ce0f82ce1629546e1e11332bee

  For each coding framework, I'd like you to use Claude Code with the Opus 4.6 model (later we'll using OpenCode instead of Claude Code, and Codex with GPT-5.5,
  but for now let's do all 4 frameworks using the same harness and the same model.

  For each coding framework, I'd like for you to evaluate how well it builds this product:
  https://github.com/openai/symphony/blob/main/SPEC.md
