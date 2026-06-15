# Capability: grading-rubric

## ADDED Requirements

### Requirement: Grading sessions capture output independently of started services
The harness SHALL capture a grading session's result without depending on the
session's live output stream reaching end-of-file. A grading session (functional
evaluator or code-quality judge) hosted on headless Claude Code SHALL redirect its
output to a file and read that file after the process exits, rather than reading the
live process stream. A long-lived process the grading agent starts (e.g. the service
under test via `start.sh`) SHALL NOT be able to keep the capture open, and each
grading session SHALL run in its own process group so that a per-call timeout tears
down the session and any process it started.

#### Scenario: Daemon under test does not wedge the grade
- **WHEN** the evaluator or judge starts the built service (which inherits the
  session's output descriptors) and leaves it running
- **THEN** the grading session's result is still captured once the agent's turn ends,
  and the call does not block waiting on the service's output stream

#### Scenario: Timeout tears down the whole session group
- **WHEN** a grading session exceeds its per-call timeout
- **THEN** the harness kills the session's entire process group (not only the
  `claude` process), leaving no orphaned service holding the output stream or a port,
  and records the timeout as a judge/evaluator infra failure rather than artifact
  signal

#### Scenario: Capture artifacts do not contaminate grading
- **WHEN** a grading session writes its redirected output to a file
- **THEN** that file is written outside the graded workspace (and the blind copy) or
  removed after reading, so it never appears to the code-quality judge or alters the
  artifact under evaluation
