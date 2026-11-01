# Design: NVIDIA BioNeMo Agent Toolkit Candidate

Evidence comes from a read-only review of the repo at `f9bb5bb3aacc` (2026-10-27).

## D1. Install by commit-pinned clone, not plugin or `npx skills`

- `claude plugin install` installs marketplace HEAD, so the pin would be
  assert-only, and the plugin version (`0.1.0`) doesn't change between
  revisions.
- `npx skills add … --yes` is documented per skill. A non-interactive install of
  all skills is unverified.

A shallow clone checked out at the pinned SHA, copying
`skills/bionemo-agent-toolkit/skills/<subset>` into the trial skills dir, is
deterministic. The install asserts the SHA, so upstream drift fails the trial
instead of silently running a different pack. This is the gstack pattern.

## D2. Hosted-NIM and database subset only

The local-GPU and Docker skills need `nvidia-container-toolkit` and a GPU
(`kermt-setup`: "verify host docker + nvidia-container-toolkit … run a GPU
smoke"). Daytona, E2B, docker-local and worktree sandboxes have neither. Copying
those skills in would add context and produce failures that look like candidate
quality. The subset list is recorded in the registry entry, and the excluded
skills are named.

## D3. Egress and key parity: one policy per run, applied to all

The core fairness rule is the identical-environment invariant, not
"no network". Within a science run:

- the egress allowlist (`health.api.nvidia.com`, UniProt, RCSB, AlphaFold-EBI,
  ColabFold) is the **same for every candidate**;
- `NGC_API_KEY` is present for **all** candidates or for **none**.

A `bare` or superpowers candidate in the same run can reach the same endpoints
with the same key, so the comparison measures whether the skills help, not who
had network access. The **no-key** run is a free control that isolates the
skills' guidance from their tool calls.

The hosted NIMs are other ML models, not chat LLMs, so this doesn't break the
single-worker-model invariant. But their outputs drive the result, so their
latency and availability are a confounder. The README admits OpenFold3 hosted
runs time out. Trials record every NIM call (endpoint, status, latency). A trial
whose NIM calls fail on the provider's side is marked `infra-error`, not scored
as a candidate failure.

## D4. Headless prompts

19 skills allow `AskUserQuestion`. In a headless trial, any interactive question
is answered from the run's fixed policy ("use the hosted NVIDIA API"), or the turn
fails fast with a clear error. It must never hang until the trial timeout. The
fairness smoke includes one prompt that would trigger the question.

## D5. Session

There are no commands, so the session is `{{BASE_PROMPT}}` once, with the generic
continuation allowlist. Marker paths for blind judging: the skills dir copy, and
any `CLAUDE.md` the install writes (expected: none).

## D6. Where it gets scored

| Target set | Purpose |
|---|---|
| Current software PRD targets | **Control only.** Expect parity with `bare` and slight context overhead; a regression there is a finding about context cost |
| Science-domain targets (to be added) | **The real comparison**: e.g. "given PDB X and ligand Y, dock, report affinity and a ranked pose list". Needs graders that tolerate stochastic model outputs (ranges, rank agreement), not exact match |

## Risks

- **Service drift:** hosted NIM versions can change under the same URL. Record
  the response model and version headers when present, and treat a change as a
  re-pin event.
- **Cost and quota:** NIM calls may be rate-limited or metered. The run budget
  needs a per-trial NIM call cap.
- **Context overhead:** many skill descriptions get loaded every turn. That's
  measured, not mitigated, since it's part of what the candidate is.

## Open Questions

1. Who builds the first science target, and what should it be? (Docking or
   folding is likely, since several hosted NIMs cover it.)
2. Does NVIDIA, as sponsor, want to provide a key and quota for eval runs, and
   should key-holding runs be published?
3. Should the Codex path be added once claude-code is validated?
