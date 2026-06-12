# Delta: eval-orchestration — harness-registry-driven invocation

## MODIFIED Requirements

### Requirement: Headless harness invocation
The orchestrator SHALL select a session driver by harness id from a versioned harness registry (`config/harnesses.yaml`), where each entry declares its driver kind (`print-cli`, `acp`, or `sdk-server`), headless invocation contract, telemetry field mapping, auth env vars, model-injection method, and pinned version. Adding a print-cli-shaped harness SHALL require only a registry entry. Telemetry fields a harness cannot report SHALL be recorded as absent, never fabricated; harness id and pinned version SHALL be recorded in trial provenance. New harnesses MUST pass a credential/protocol probe and a bare n=1 smoke trial before matrix eligibility.

#### Scenario: Print-cli harness added by configuration
- **WHEN** an operator registers Gemini CLI in the harness registry with its flags and output mapping, and a probe plus bare smoke pass
- **THEN** runs with `--harness gemini-cli` execute trials through the shared print-cli driver with no orchestration code changes, and provenance records the harness id and pinned version

#### Scenario: Unregistered harness refused
- **WHEN** a run requests a harness id absent from the harness registry
- **THEN** the run fails at load time listing registered harnesses and their status (implemented / candidate / unknown)

#### Scenario: Telemetry gaps stay honest
- **WHEN** a trial runs on a harness whose registry mapping declares no cost reporting
- **THEN** session records carry token counts with cost null and cost-source `tokens-only`, and the run's spend dimension falls back consistently for all candidates in that run
