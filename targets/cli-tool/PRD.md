# `tally` — Line-Oriented Tally CLI Specification

Status: v1.0. Normative language per RFC 2119.

## 1. Purpose

`tally` is a single-binary command-line utility that counts and summarizes
newline-delimited records from stdin or files, designed for use in shell
pipelines.

## 2. Invocation

```
tally [OPTIONS] [FILE...]
```

- With no FILE arguments, `tally` MUST read from stdin.
- With one or more FILE arguments, `tally` MUST process them in order as a
  single concatenated stream.
- A FILE of `-` MUST mean stdin at that position.

## 3. REQUIRED Behavior

### 3.1 Default mode
With no options, `tally` MUST print three space-separated integers —
`<lines> <words> <bytes>` — followed by a newline, matching the semantics of
POSIX `wc` for those three counts.

### 3.2 `--unique`
MUST print each distinct input line once, prefixed by its occurrence count
right-aligned in a 7-character field, ordered by descending count, ties
broken by first appearance.

### 3.3 `--top N`
MUST limit `--unique` output to the N highest counts. Using `--top` without
`--unique` MUST exit 2 with an error on stderr.

### 3.4 `--json`
MUST print a single JSON object instead of text:
`{"lines":L,"words":W,"bytes":B}` in default mode, or
`{"unique":[{"count":C,"line":S},...]}` in `--unique` mode. Output MUST be
valid JSON parseable by `jq`.

### 3.5 `--version`
MUST print the semantic version (matching the project metadata file) and
exit 0.

### 3.6 Exit codes
- 0 success; 1 I/O error (e.g. unreadable FILE), with message on stderr;
  2 usage error (unknown flag, invalid N), with usage text on stderr.
- Error messages MUST go to stderr only; stdout MUST stay clean.

### 3.7 Robustness
- Empty input MUST produce `0 0 0` (or `{"lines":0,"words":0,"bytes":0}`),
  exit 0.
- Lines up to 1 MiB MUST be handled. Input that is not valid UTF-8 MUST NOT
  crash the program (byte counts still correct).

## 4. REQUIRED Project Shape (Definition of Done)

- D1: `setup.sh` installs all dependencies; `run.sh ARGS...` invokes the tool.
- D2: Default mode counts match POSIX `wc` on the same input.
- D3: `--unique` ordering and field formatting per 3.2.
- D4: `--top` limiting and its usage-error path per 3.3.
- D5: `--json` outputs parse with `jq` per 3.4.
- D6: `--version` reflects project metadata per 3.5.
- D7: Exit-code contract per 3.6 (0/1/2, stderr-only errors).
- D8: Robustness per 3.7 (empty input, long lines, non-UTF-8 bytes).
- D9: The project includes its own test suite that passes via `setup.sh`-installed tooling.
- D10: A README documents usage with at least three pipeline examples.

## 5. Non-Goals

Locale-aware word splitting, parallelism, file watching, and config files
are out of scope.
