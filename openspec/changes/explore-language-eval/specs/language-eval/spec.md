# Capability: language-eval

## ADDED Requirements

### Requirement: Language as an orthogonal evaluation axis
The harness SHALL support a language-evaluation run mode that holds the harness
and model fixed and varies the implementation language across a single
language-agnostic target. The agent (candidate) dimension MAY collapse to one
fixed agent for this mode. The selected language SHALL be recorded in provenance
and results.

#### Scenario: Same task, multiple languages
- **WHEN** a language-eval run is started with a polyglot target and the languages Python, Go, Rust
- **THEN** the harness runs the identical task spec for each language, holding harness and model constant, and records the language on each trial

### Requirement: Language-neutral spec and test suite
A polyglot target SHALL define an implementation-language-agnostic specification
and a black-box test suite (observable CLI/filesystem behavior) that runs against
any language's build via a declared per-language build-and-run contract. The spec
SHALL NOT require capabilities that only a subset of languages obtain for free
from their standard library or ecosystem.

#### Scenario: Library-neutral requirement
- **WHEN** the spec needs a hashing or similar primitive that some languages ship in their stdlib and others do not
- **THEN** the spec defines the algorithm explicitly so no language is advantaged by ecosystem availability

#### Scenario: Build-and-run contract per language
- **WHEN** a language is evaluated
- **THEN** the target provides how to install its toolchain, build the implementation, and invoke the produced program, and the shared test suite is run against it unchanged

### Requirement: Efficiency metrics without cross-language quality judging
Language-eval SHALL score each language by pass@1 against the test suite plus
efficiency signals: wall-clock generation time, cost, token usage, and lines of
generated implementation (LOC). Language-eval SHALL NOT apply an LLM code-quality
judge in this mode, because cross-language judging carries language bias; this
exclusion SHALL be stated in the results.

#### Scenario: Pass-gated efficiency score
- **WHEN** a language's implementation fails the test suite
- **THEN** it is recorded as a pass@1 failure and excluded from the efficiency ranking, not assigned a quality score

#### Scenario: LOC reported
- **WHEN** a language's implementation passes
- **THEN** the lines of the generated implementation (excluding tests and generated lockfiles) are recorded as a metric

### Requirement: Cross-language ranking within a run
Because a language-eval run uses the same target across languages, results SHALL
permit ranking languages against one another within that run. This is distinct
from the cross-target rule, which forbids aggregating scores computed against
different test plans.

#### Scenario: Language leaderboard
- **WHEN** multiple languages complete the same polyglot target in one run
- **THEN** the report ranks them by the pass-gated efficiency composite, and labels the ranking as valid only within this target
