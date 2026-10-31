# Tasks: Explore ScienceClaw as a Harness

## 1. Feasibility probes (no driver yet)

- [ ] 1.1 Pin a commit; confirm a fully non-interactive install + `setup.py --quick --profile <p> --name <n>` in a fresh container; list every remaining prompt
- [ ] 1.2 Run `scienceclaw-investigate "<topic>" --dry-run` with its LLM pointed at a base URL serving one model; capture all outbound hosts; confirm no Infinite traffic with dry-run
- [ ] 1.3 Inventory skills needing other providers (OpenRouter, Perplexity, OpenAI, Gemini); confirm they fail closed without keys
- [ ] 1.4 Two consecutive runs with fresh `HOME`: confirm no state carries over

## 2. Decision

- [ ] 2.1 Write the go / pivot (K-Dense skills candidate) / no-go decision into design.md with the evidence from §1 and the D6 disabled-capability list

## 3. If go

- [ ] 3.1 `scienceclaw` entry in `config/harnesses.yaml` + `src/driver/scienceclaw.ts` implementing `HarnessDriver` (one investigation per trial, output captured)
- [ ] 3.2 Gateway routing (depends on `add-brownfield-track` 4.3); placeholder credential only
- [ ] 3.3 Isolation: fresh HOME, no daemon, Infinite blocked; science-database egress allowlist shared with other harnesses
- [ ] 3.4 Disabled-capability disclosure in reports
- [ ] 3.5 n=1 smoke on the first science-question target (shared dependency with `add-bionemo-agent-toolkit`)

## 4. If pivot

- [ ] 4.1 Open `add-kdense-scientific-skills` as an ordinary claude-code candidate (pinned clone, egress allowlist, no other-provider keys)
