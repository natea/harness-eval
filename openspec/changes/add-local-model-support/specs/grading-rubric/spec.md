# Capability: grading-rubric

## MODIFIED Requirements

### Requirement: Code-quality judge with tools
The system SHALL grade code quality with an LLM judge given tool access (test
runner, linter, type-checker, coverage, and the PRD text) and a fixed criterion
list covering at minimum: meaningful and passing tests, architectural conformance
to the spec's §3.2 abstraction layers, error-handling robustness, absence of
dead/duplicated code, and documentation adequacy. Each criterion SHALL yield a
0–10 score with written justification citing evidence.

The judge SHALL select its client implementation by the judge profile's transport,
supporting both native Anthropic and `openai-compat` (OpenAI-compatible
`/v1/chat/completions`) endpoints, so a local or remote OpenAI-compatible model can
serve as the judge. The criterion list, temperature, scrubbing, and sample-median
rules SHALL be identical across transports. When a judge model returns no
structured `record_score` tool call for a sample, the judge SHALL fall back to
parsing the score and justification from the model's text output and SHALL flag the
sample as having used the fallback in the grading record; a sample with neither a
tool call nor a parseable score SHALL be recorded as an error, never a silent zero.

#### Scenario: Judge runs the test suite
- **WHEN** the code-quality judge grades a workspace
- **THEN** it executes the candidate's own test suite and includes the observed
  pass/fail/coverage results as evidence in the tests criterion score, rather than
  scoring from code reading alone

#### Scenario: OpenAI-compatible judge transport
- **WHEN** a run sets the judge model to an `openai-compat` profile (local or
  remote)
- **THEN** judging runs against that endpoint's `/v1/chat/completions` API with the
  same criteria and median-of-three rules, and the grading record notes the
  transport used

#### Scenario: Tool-call fallback flagged
- **WHEN** a judge sample returns no `record_score` tool call but its text contains
  a parseable 0–10 score and rationale
- **THEN** the score is recorded with the sample flagged as fallback-parsed, so a
  judge that fails structured tool-calling is visible in the grading record
