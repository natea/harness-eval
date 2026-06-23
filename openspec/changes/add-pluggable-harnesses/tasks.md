# Tasks: Pluggable Harness Layer

## 1. Registry

- [ ] 1.1 Harness-registry zod schema + config/harnesses.yaml (id, driverKind, version pin, invocation contract, telemetry map, auth envVars, model-injection method, status)
- [ ] 1.2 Replace HarnessId enum with registry-validated ids; candidate-registry harness sections validated against it
- [ ] 1.3 Generate .env.example entries + redaction patterns from registry auth declarations

## 2. Drivers

- [ ] 2.1 Parameterized print-cli driver (flags + output-parser map; Claude Code becomes its first instance)
- [ ] 2.2 Register + probe Gemini CLI and Qwen Code (gemini -p / qwen -p; JSON output mapping)
- [ ] 2.3 Register + probe Codex (codex exec) and Grok CLI
- [ ] 2.4 Register + probe Kimi Code CLI; investigate MiniMax Agent CLI availability (may be web-only — record verdict)
- [ ] 2.5 ACP driver shared with zerocode; register Goose via ACP
- [ ] 2.6 sdk-server driver skeleton; register OpenHands headless and OpenCode server mode

## 3. Validation

- [ ] 3.1 Unit tests: registry validation, driver selection, print-cli parser map per harness fixture
- [ ] 3.2 Bare smoke (n=1, symphony-daemon) per newly registered harness before matrix eligibility; record cost/billing path per harness
- [ ] 3.3 First cross-harness leaderboard: bare candidate across all smoked harnesses at one pinned model where the model is available; document caveats where model parity is impossible
- [ ] 3.4 docs/: harness onboarding guide + support matrix (framework × harness)
