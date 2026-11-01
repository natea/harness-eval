# brownfield/paper-qa — spike artifacts (2026-10-31)

Committed artifact store for the brownfield track pilot on Future-House/paper-qa.
Findings and decisions live in `openspec/changes/add-brownfield-track/`.

- `candidates.json` — 36 merged PRs with closing issue refs (number, merge SHA, issues)
- `snapshots/` — issue reconstructed at T* (= earliest PR commit − 1s):
  `*.snapshot.json` (structured, bot-tagged), `*.body.md`, `*.body+comments.md`.
  Gitignored, regenerable: `*.live.md` (issue as it reads today, for diffing), `*.raw.json` (GraphQL)
- `leaks/` — LLM leak labels per issue (claude-sonnet-5-5, gold-aware), `summary.json`
- `validate/` — per-PR FAIL_TO_PASS validation: `results.json` and split patches (logs/junit gitignored)
- `spike/` — the scripts that produced the above; superseded by `src/brownfield/` (tasks.md §1, §3). They read/write data one level up (this folder) and expect a paper-qa clone at ~/Documents/code/paper-qa.

Attribution: see `../NOTICE`. Layout becomes the task-bundle format (design D2) once the miner lands.
