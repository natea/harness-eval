# Capability: grading-rubric

## ADDED Requirements

### Requirement: Default grading driver is the subscription
The system SHALL grade orchestrated runs on the subscription by default. The shared
`gradeTrials` path used by the studio and the CLI `run --grade` SHALL default to the
subscription-backed Claude Code grading driver, with the direct-SDK driver available
only as an explicit opt-in. The default SHALL
NOT require an Anthropic API balance: a studio run whose worker built on the
subscription SHALL be gradeable on the same subscription, so an empty API balance
never silently blocks grading. The choice of driver SHALL NOT change grading
semantics — the same evaluator test plan and blind code-quality judging run on the
same scrubbed, workspace-blind copy regardless of transport.

#### Scenario: Studio run grades on the subscription
- **WHEN** a real studio run completes its build and grading begins with no Anthropic
  API credit available
- **THEN** grading runs on the subscription (Claude Code) driver and completes,
  producing adherence and code-quality scores without a credit-balance error

#### Scenario: SDK driver remains an explicit opt-in
- **WHEN** an operator selects the SDK grading driver
- **THEN** grading runs against the Anthropic API and is billed to the API account,
  exactly as before — the default is subscription, the SDK path is opt-in

#### Scenario: Driver does not affect what is judged
- **WHEN** the same artifact is graded by either driver
- **THEN** both execute the same frozen test plan and the same blind code-quality
  criteria on the framework-marker-scrubbed copy; only the transport and billing differ
