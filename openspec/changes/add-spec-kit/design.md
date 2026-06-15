# Design: Add Spec-Kit as a Candidate Framework

## Context

Existing candidates are Claude Code **plugins**: install via `claude plugin
install <name>@<marketplace>` and assert a pinned version. Spec-Kit is different —
it's an external CLI (`specify`, installed with `uv`) that **initializes
project-local slash commands** (`/speckit.*`) and templates into the workspace.
The candidate-registry schema already allows arbitrary install shell + a
slash-command session script, so no schema change is needed; this change just
adds the entry and records the new install shape in the spec.

## Decisions

### Install: CLI + project init, version-pinned

```
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.10.2
specify init . --ai claude --force
specify check   # (assert prerequisites + record the resolved version)
```

`specify init . --ai claude` writes `.specify/` (constitution memory, scripts,
templates) and the `/speckit.*` commands for the Claude Code host into the
workspace. The exact init flags (`--ai claude` vs `--integration claude`, and the
in-place `--force`) are confirmed against `v0.10.2` during implementation; the
version is **pinned and asserted** the same way plugin candidates are, so upstream
drift fails the trial deterministically (re-pin to bump).

### Session script: the spec-driven workflow

The shared base prompt is injected once, at `/speckit.specify`:

```
/speckit.constitution
/speckit.specify {{BASE_PROMPT}}
/speckit.plan
/speckit.tasks
/speckit.implement
```

These are the framework's prescribed command wrappers — the only additions
allowed by the fairness rules. `{{BASE_PROMPT}}` is the identical rendered target
prompt every candidate receives. Optional `/speckit.clarify` / `/speckit.analyze`
are **excluded** to keep the session non-interactive and comparable (documented,
like Compound Engineering's `/ce-compound` exclusion).

### Sandbox prerequisites

Spec-Kit needs **Python 3.11+, `uv`, and git** in the trial image. These are added
to the snapshot build (system-wide, uid-1000 friendly) so the install step is
cold-start reproducible rather than network-fetching a toolchain per trial.

### Marker scrubbing

`.specify/` and `specs/` are Spec-Kit's fingerprints; they're added to the
candidate's `markerPaths` so the blind code-quality judge can't identify the
framework from the artifact.

## Risks / Trade-offs

- **Init-flag drift across versions** — `specify init` flags change between
  releases; pinning `v0.10.2` and asserting the version makes this deterministic,
  and re-pinning is a deliberate, reviewed bump.
- **Heavier image** — adding `uv`/Python grows the snapshot; acceptable and shared
  by any future spec-driven candidate.
- **Workflow depth vs speed** — like gsd, the multi-step spec workflow may cost on
  the Speed/Token dimensions; that trade-off is exactly what the eval measures.
