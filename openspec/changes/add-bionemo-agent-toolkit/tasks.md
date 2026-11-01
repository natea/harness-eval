# Tasks: Add NVIDIA BioNeMo Agent Toolkit as a Candidate

## 1. Confirm the pack at a pinned commit

- [ ] 1.1 Pick the pin commit; list all 45 skills with their runtime need (hosted NIM / bio database / local GPU or Docker); record the subset and the excluded skills
- [ ] 1.2 Confirm the subset loads in Claude Code from a skills-dir copy (no plugin), with no interactive install step

## 2. Registry entry

- [ ] 2.1 Add the `bionemo-agent-toolkit` candidate to `config/registry.yaml` (claude-code): pinned SHA, clone + subset copy, SHA assertion, marker paths
- [ ] 2.2 Session: `{{BASE_PROMPT}}` once; generic content-free continuation allowlist
- [ ] 2.3 `bun run src/cli.ts validate` passes

## 3. Fairness and isolation guards

- [ ] 3.1 Per-run science egress policy (allowlist + key present/absent) applied identically to all candidates; recorded in provenance
- [ ] 3.2 Add the `nvapi-` key pattern to `src/driver/archive.ts` redaction; verify a transcript containing a key is redacted
- [ ] 3.3 Headless prompt handling: a skill question is answered from policy or fails fast; smoke with a prompt that triggers "hosted vs local"
- [ ] 3.4 Record hosted-model calls (endpoint, status, latency); mark provider-side failures `infra-error`

## 4. Smoke

- [ ] 4.1 n=1 control on one existing software target (expect parity with `bare`); confirm telemetry shows only the worker model and no blocked prompts
- [ ] 4.2 n=1 on the first science target once it exists (depends on open question 1), with and without the key
