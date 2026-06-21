# Capability: harness-drivers

## ADDED Requirements

### Requirement: Driver contract conformance
Every registered harness driver SHALL pass a shared contract-test suite that
asserts the cross-driver invariants offline (no real spend, no network, no
provisioned sandbox), using a fake sandbox and a recorded output fixture for that
driver. Adding a new driver SHALL require registering a conformance case for it.
The suite SHALL assert, for each driver: dispatch by harness id, capture of session
output to a file read after the run process returns, normalization of the recorded
output into the common session record, classification of the cost source, identity
of the rendered base prompt across drivers, and fail-fast on an unregistered
harness id.

#### Scenario: Registered driver passes the contract suite
- **WHEN** a harness driver is registered in the driver registry
- **THEN** a conformance case exists for it and the contract suite asserts its
  dispatch, output-by-file capture, telemetry normalization, cost-source
  classification, and base-prompt fairness against a recorded fixture, with no real
  spend

#### Scenario: Output captured to a file, not the run stream
- **WHEN** the contract suite runs a driver against its fixture
- **THEN** the prompt is written to a namespaced file and the transcript is read in
  a separate exec issued after the run exec returns, so a service the harness starts
  cannot hold the capture open

#### Scenario: Unregistered harness fails before sandbox use
- **WHEN** the contract suite requests a driver for a harness id with no registered
  driver
- **THEN** resolution throws naming the missing driver and no sandbox method is
  called
