# Delta: eval-orchestration — harness-generic headless invocation

## MODIFIED Requirements

### Requirement: Headless harness invocation
The orchestrator SHALL drive the selected harness through its documented headless protocol via a per-harness session driver, executing the candidate's session script as an ordered sequence of prompts with documented continuation rules. For `claude-code`: `claude -p` with stream-JSON output and permissions disabled. For `zerocode` (ZeroClaw): a per-trial `zeroclaw` daemon driven over ACP (initialize → session/new in the workspace → prompt turns), autonomy configured non-interactive, with the ACP handshake version asserted against the pinned release (mismatch = infra failure). Session telemetry SHALL be captured per driver and normalized into the standard session records, recording absent fields as absent rather than fabricated.

#### Scenario: Single-prompt candidate session
- **WHEN** a Superpowers trial runs on claude-code
- **THEN** the orchestrator issues one headless session containing the base task prompt and captures the streamed JSON output including the final result message

#### Scenario: zerocode bare session
- **WHEN** a `bare` trial runs on harness `zerocode`
- **THEN** the driver starts the daemon in the trial sandbox, opens an ACP session with the workspace as cwd, submits the rendered base prompt, streams tool-call updates until turn completion, and records duration, token usage, and turn count in the session record

#### Scenario: Multi-command candidate session
- **WHEN** a GSD trial runs
- **THEN** the orchestrator issues the scripted command sequence, resuming the session or starting new sessions exactly as the candidate's session script specifies, until the script completes or a budget cap is reached
